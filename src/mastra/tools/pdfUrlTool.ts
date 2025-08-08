import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { extractTextFromPdf } from '../../../utils/parsePdfText';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { invoiceTool } from './invoiceTool';
import { contractTool } from './contractTool';
import { receiptTool } from './receiptTool';
import { addToJSONDatabase } from '../../../utils/jsonDatabase';

export const pdfUrlTool = createTool({
  id: 'download-and-process-pdf-url',
  description: 'Download PDF from URL and process it to extract structured data',
  inputSchema: z.object({
    pdfUrl: z.string().url().describe('URL to the PDF file to download and process'),
  }),
  execute: async (executionContext) => {
    const { context, mastra } = executionContext;
    const { pdfUrl } = context;
    
    try {
      console.log(`🌐 Downloading PDF from: ${pdfUrl}`);
      
      // Validate URL format
      let url: URL;
      try {
        url = new URL(pdfUrl);
      } catch (error) {
        throw new Error(`Invalid URL format: ${pdfUrl}. Please provide a valid HTTP or HTTPS URL.`);
      }
      
      // Check if it's a supported protocol
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Unsupported protocol: ${url.protocol}. Only HTTP and HTTPS URLs are supported. For local files, use the regular CLI: npx tsx agent.ts <file_path>`);
      }
      
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
      
      // Extract text from PDF
      const textContent = await extractTextFromPdf(filePath);
      console.log('📄 Text extracted successfully');
      
      // Classify document type
      const classificationPrompt = `Analyze this document content and classify it as exactly one of: invoice, contract, receipt
      
Document content:
${textContent}

Respond with just the document type (invoice, contract, or receipt).`;

      const classificationResult = await generateText({
        model: groq('llama3-70b-8192'),
        messages: [{ role: 'user', content: classificationPrompt }],
        temperature: 0.1,
      });

      const docType = classificationResult.text.toLowerCase().trim();
      console.log(`🏷️  Classified as: ${docType}`);
      
      // Use appropriate tool based on classification
      let result;
      if (docType.includes('invoice')) {
        result = await invoiceTool.execute({ 
          context: { text: textContent },
          mastra: mastra!,
          runtimeContext: {} as any,
        });
      } else if (docType.includes('contract')) {
        result = await contractTool.execute({ 
          context: { text: textContent },
          mastra: mastra!,
          runtimeContext: {} as any,
        });
      } else if (docType.includes('receipt')) {
        result = await receiptTool.execute({ 
          context: { text: textContent },
          mastra: mastra!,
          runtimeContext: {} as any,
        });
      }
      
      // Save to JSON database
      const fieldCount = typeof result === 'object' && result !== null 
        ? Object.keys(result).length 
        : 0;
      
      console.log('💾 Saving to JSON database...');
      const databasePath = addToJSONDatabase(
        result,
        filePath,
        docType as 'invoice' | 'contract' | 'receipt',
        fieldCount
      );
      console.log(`💾 Saved to database: ${path.basename(databasePath)}`);
      
      return {
        success: true,
        fileName,
        filePath,
        pdfUrl,
        documentType: docType,
        extractedData: result,
        fileSize: buffer.length,
        databasePath,
        extractedFields: fieldCount,
        message: `Successfully downloaded and processed PDF from ${pdfUrl} as ${docType}`,
      };
      
    } catch (error) {
      console.error('❌ PDF URL processing error:', error);
      
      return {
        success: false,
        pdfUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Failed to process PDF from ${pdfUrl}`,
      };
    }
  },
});
