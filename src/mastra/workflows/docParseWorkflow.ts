import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { invoiceTool } from '../tools/invoiceTool';
import { contractTool } from '../tools/contractTool';
import { receiptTool } from '../tools/receiptTool';
import { addToJSONDatabase } from '../../../utils/jsonDatabase';

// Document classification step
const classifyDocument = createStep({
  id: 'classify-document',
  description: 'Classify the document type based on extracted text',
  inputSchema: z.object({
    text: z.string().describe('Raw PDF text content'),
    filePath: z.string().describe('Path to the PDF file'),
  }),
  outputSchema: z.object({
    documentType: z.enum(['invoice', 'contract', 'receipt']),
    text: z.string(),
    filePath: z.string(),
    confidence: z.number(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { text, filePath } = inputData;

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
        model: groq('llama-3.3-70b-versatile'),
        prompt: classificationPrompt,
        temperature: 0.1,
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

      return {
        documentType,
        text,
        filePath,
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
    confidence: z.number(),
  }),
  outputSchema: z.object({
    extractedData: z.unknown(),
    documentType: z.string(),
    filePath: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { documentType, text, filePath } = inputData;

    try {
      let extractedData;

      // Route to appropriate tool based on document type
      switch (documentType) {
        case 'invoice':
          extractedData = await invoiceTool.execute({
            context: { text },
            mastra: mastra!,
            runtimeContext: {} as any,
          });
          break;
        case 'contract':
          extractedData = await contractTool.execute({
            context: { text },
            mastra: mastra!,
            runtimeContext: {} as any,
          });
          break;
        case 'receipt':
          extractedData = await receiptTool.execute({
            context: { text },
            mastra: mastra!,
            runtimeContext: {} as any,
          });
          break;
        default:
          throw new Error(`Unsupported document type: ${documentType}`);
      }

      return {
        extractedData,
        documentType,
        filePath,
        success: true,
      };
    } catch (error) {
      throw new Error(`Data extraction failed: ${error}`);
    }
  },
});

// Save to JSON database step
const saveToJSONDatabase = createStep({
  id: 'save-to-json-database',
  description: 'Save extracted data to JSON database',
  inputSchema: z.object({
    extractedData: z.unknown(),
    documentType: z.string(),
    filePath: z.string(),
    success: z.boolean(),
  }),
  outputSchema: z.object({
    outputPath: z.string(),
    success: z.boolean(),
    extractedFields: z.number(),
    documentType: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { extractedData, filePath, documentType } = inputData;

    try {
      // Count extracted fields
      const fieldCount = typeof extractedData === 'object' && extractedData !== null 
        ? Object.keys(extractedData).length 
        : 0;

      // Save to JSON database
      const jsonPath = addToJSONDatabase(
        extractedData, 
        filePath, 
        documentType as 'invoice' | 'contract' | 'receipt',
        fieldCount
      );

      return {
        outputPath: jsonPath,
        success: true,
        extractedFields: fieldCount,
        documentType,
      };
    } catch (error) {
      throw new Error(`Failed to save to JSON database: ${error}`);
    }
  },
});

// Main workflow
const docParseWorkflow = createWorkflow({
  id: 'document-parse-workflow',
  inputSchema: z.object({
    text: z.string().describe('Raw PDF text content'),
    filePath: z.string().describe('Path to the PDF file'),
  }),
  outputSchema: z.object({
    outputPath: z.string(),
    success: z.boolean(),
    extractedFields: z.number(),
    documentType: z.string(),
  }),
})
  .then(classifyDocument)
  .then(extractDocumentData)
  .then(saveToJSONDatabase);

docParseWorkflow.commit();

export { docParseWorkflow };
