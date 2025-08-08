import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { extractTextFromPdf } from '../../../utils/parsePdfText';
import { invoiceTool } from '../tools/invoiceTool';
import { contractTool } from '../tools/contractTool';
import { receiptTool } from '../tools/receiptTool';
import { addToJSONDatabase } from '../../../utils/jsonDatabase';
import { evaluateExtractedData } from '../../../evals/docEval';
import { Step, Workflow } from '@mastra/core';

// PDF download step
const downloadPdf = createStep({
  id: 'download-pdf',
  description: 'Download PDF from URL',
  inputSchema: z.object({
    pdfUrl: z.string().url().describe('URL to the PDF file'),
  }),
  outputSchema: z.object({
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { pdfUrl } = inputData;

    try {
      console.log(`🌐 Downloading PDF from: ${pdfUrl}`);
      
      // Download PDF from URL
      const response = await fetch(pdfUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/pdf')) {
        throw new Error(`URL does not point to a PDF file. Content-Type: ${contentType}`);
      }
      
      // Get PDF buffer
      const pdfBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(pdfBuffer);
      
      // Create outputs folder if it doesn't exist
      // Go to project root (up from .mastra/output if in dev mode)
      const projectRoot = process.cwd().includes('.mastra') 
        ? path.resolve(process.cwd(), '../../') 
        : process.cwd();
      const outputsFolder = path.join(projectRoot, 'outputs');
      if (!fs.existsSync(outputsFolder)) {
        fs.mkdirSync(outputsFolder, { recursive: true });
      }
      
      // Generate filename from URL
      const urlPath = new URL(pdfUrl).pathname;
      let fileName = path.basename(urlPath);
      
      // If no filename or extension, generate one
      if (!fileName || !fileName.includes('.')) {
        fileName = `download_${Date.now()}.pdf`;
      } else if (!fileName.toLowerCase().endsWith('.pdf')) {
        fileName += '.pdf';
      }
      
      // Save the downloaded file
      const filePath = path.join(outputsFolder, fileName);
      fs.writeFileSync(filePath, buffer);
      
      console.log(`📁 PDF saved: ${filePath}`);
      console.log(`📊 File size: ${(buffer.length / 1024).toFixed(1)} KB`);

      return {
        filePath,
        fileName,
        fileSize: buffer.length,
        pdfUrl,
      };
    } catch (error) {
      throw new Error(`Failed to download PDF: ${error}`);
    }
  },
});

// Text extraction step
const extractText = createStep({
  id: 'extract-text',
  description: 'Extract text from the downloaded PDF',
  inputSchema: z.object({
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
  }),
  outputSchema: z.object({
    text: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { filePath, fileName, fileSize, pdfUrl } = inputData;

    try {
      console.log('📄 Extracting text from PDF...');
      const text = await extractTextFromPdf(filePath);
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text could be extracted from PDF');
      }

      console.log(`📄 Extracted ${text.length} characters of text`);

      return {
        text,
        filePath,
        fileName,
        fileSize,
        pdfUrl,
      };
    } catch (error) {
      throw new Error(`Text extraction failed: ${error}`);
    }
  },
});

// Document classification step
const classifyDocument = createStep({
  id: 'classify-document',
  description: 'Classify the document type based on extracted text',
  inputSchema: z.object({
    text: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
  }),
  outputSchema: z.object({
    documentType: z.enum(['invoice', 'contract', 'receipt']),
    text: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    confidence: z.number(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { text, filePath, fileName, fileSize, pdfUrl } = inputData;

    // Classification prompt
    const classificationPrompt = `Analyze this document text and classify it as one of these types:
- invoice: Bills, invoices, payment requests
- contract: Agreements, service contracts, terms of service
- receipt: Payment confirmations, receipts, payment records (especially Stripe)

Look for key indicators:
- Invoice: "Invoice", "Bill to", "Amount due", "Payment terms"
- Contract: "Agreement", "Terms", "Party", "Effective date", "Termination"
- Receipt: "Receipt", "Payment", "Charged", "Transaction", "Stripe"

Text to analyze:
${text.substring(0, 2000)}...

Return ONLY the classification type: invoice, contract, or receipt`;

    try {
      const result = await generateText({
        model: groq('llama3-70b-8192'), // Use faster model
        prompt: classificationPrompt,
        temperature: 0.1,
        maxTokens: 50, // Classification needs very few tokens
      });

      const classification = result.text.toLowerCase().trim();
      
      // Validate classification
      let documentType: 'invoice' | 'contract' | 'receipt';
      let confidence = 0.8;

      if (classification.includes('invoice')) {
        documentType = 'invoice';
      } else if (classification.includes('contract')) {
        documentType = 'contract';
      } else if (classification.includes('receipt')) {
        documentType = 'receipt';
      } else {
        // Fallback: try to detect based on keywords
        const textLower = text.toLowerCase();
        
        if (textLower.includes('invoice') || textLower.includes('bill to') || textLower.includes('amount due')) {
          documentType = 'invoice';
          confidence = 0.6;
        } else if (textLower.includes('agreement') || textLower.includes('contract') || textLower.includes('terms')) {
          documentType = 'contract';
          confidence = 0.6;
        } else if (textLower.includes('receipt') || textLower.includes('stripe') || textLower.includes('payment')) {
          documentType = 'receipt';
          confidence = 0.6;
        } else {
          throw new Error('Could not classify document type');
        }
      }

      console.log(`🏷️  Classified as: ${documentType} (confidence: ${confidence})`);

      return {
        documentType,
        text,
        filePath,
        fileName,
        fileSize,
        pdfUrl,
        confidence,
      };
    } catch (error) {
      throw new Error(`Classification failed: ${error}`);
    }
  },
});

// Document extraction step
const extractDocumentData = createStep({
  id: 'extract-document-data',
  description: 'Extract structured data based on document type',
  inputSchema: z.object({
    documentType: z.enum(['invoice', 'contract', 'receipt']),
    text: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    confidence: z.number(),
  }),
  outputSchema: z.object({
    extractedData: z.unknown(),
    documentType: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { documentType, text, filePath, fileName, fileSize, pdfUrl } = inputData;

    try {
      console.log(`🔄 Starting data extraction for ${documentType}...`);
      let extractedData;

      // Route to appropriate tool based on document type
      switch (documentType) {
        case 'invoice':
          console.log('📄 Using invoice tool...');
          extractedData = await invoiceTool.execute({
            context: { text },
            mastra: mastra!,
            runtimeContext: {} as any,
          });
          break;
        case 'contract':
          console.log('📄 Using contract tool...');
          extractedData = await contractTool.execute({
            context: { text },
            mastra: mastra!,
            runtimeContext: {} as any,
          });
          break;
        case 'receipt':
          console.log('📄 Using receipt tool...');
          extractedData = await receiptTool.execute({
            context: { text },
            mastra: mastra!,
            runtimeContext: {} as any,
          });
          break;
        default:
          throw new Error(`Unsupported document type: ${documentType}`);
      }

      console.log(`✅ Data extraction completed for ${documentType}`);
      console.log(`✅ Extracted structured data for ${documentType}`);

      return {
        extractedData,
        documentType,
        filePath,
        fileName,
        fileSize,
        pdfUrl,
        success: true,
      };
    } catch (error) {
      throw new Error(`Data extraction failed: ${error}`);
    }
  },
});

// Save to database step
const saveToDatabase = createStep({
  id: 'save-to-database',
  description: 'Save extracted data to JSON database',
  inputSchema: z.object({
    extractedData: z.unknown(),
    documentType: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    success: z.boolean(),
  }),
  outputSchema: z.object({
    databasePath: z.string(),
    success: z.boolean(),
    extractedFields: z.number(),
    documentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    extractedData: z.unknown(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { extractedData, documentType, filePath, fileName, fileSize, pdfUrl } = inputData;

    try {
      // Count extracted fields
      const fieldCount = typeof extractedData === 'object' && extractedData !== null 
        ? Object.keys(extractedData).length 
        : 0;

      console.log('💾 Saving to JSON database...');
      const databasePath = addToJSONDatabase(
        extractedData,
        filePath,
        documentType as 'invoice' | 'contract' | 'receipt',
        fieldCount
      );
      console.log(`💾 Saved to database: ${path.basename(databasePath)}`);

      return {
        databasePath,
        success: true,
        extractedFields: fieldCount,
        documentType,
        fileName,
        fileSize,
        pdfUrl,
        extractedData,
      };
    } catch (error) {
      throw new Error(`Failed to save to database: ${error}`);
    }
  },
});

// Evaluation step
const evaluateData = createStep({
  id: 'evaluate-data',
  description: 'Evaluate quality of extracted data',
  inputSchema: z.object({
    extractedData: z.unknown(),
    documentType: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    success: z.boolean(),
    databasePath: z.string(),
    extractedFields: z.number(),
  }),
  outputSchema: z.object({
    evaluation: z.any().nullable(),
    qualityScore: z.number().nullable(),
    extractedData: z.unknown(),
    documentType: z.string(),
    filePath: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    success: z.boolean(),
    databasePath: z.string(),
    extractedFields: z.number(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    try {
      console.log('🧪 Running quality evaluation...');
      
      const evaluation = await evaluateExtractedData(
        inputData.extractedData,
        undefined,
        `Extract structured data from this ${inputData.documentType} document`
      );
      
      console.log(`🎯 Quality Score: ${evaluation.score.toFixed(1)}/100`);
      console.log(`📋 Completeness: ${evaluation.completeness.toFixed(1)}%`);
      
      if (evaluation.errors.length > 0) {
        console.log(`🚨 Found ${evaluation.errors.length} errors`);
      }
      
      if (evaluation.warnings.length > 0) {
        console.log(`⚠️  Found ${evaluation.warnings.length} warnings`);
      }
      
      return {
        ...inputData,
        evaluation,
        qualityScore: evaluation.score
      };
    } catch (error) {
      console.warn('⚠️  Evaluation failed, continuing without quality metrics:', error);
      return {
        ...inputData,
        evaluation: null,
        qualityScore: null
      };
    }
  },
});

// Main workflow for URL-based PDF processing
const pdfUrlWorkflow = createWorkflow({
  id: 'pdf-url-workflow',
  inputSchema: z.object({
    pdfUrl: z.string().url().describe('URL to the PDF file'),
  }),
  outputSchema: z.object({
    databasePath: z.string(),
    success: z.boolean(),
    extractedFields: z.number(),
    documentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    pdfUrl: z.string(),
    evaluation: z.any().nullable(),
    qualityScore: z.number().nullable(),
  }),
})
  .then(downloadPdf)
  .then(extractText)
  .then(classifyDocument)
  .then(extractDocumentData)
  .then(saveToDatabase)
  .then(evaluateData);

pdfUrlWorkflow.commit();

export { pdfUrlWorkflow };
