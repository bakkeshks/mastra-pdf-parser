#!/usr/bin/env node

import 'dotenv/config';
import { parseArgs } from 'node:util';
import path from 'path';
import { mastra } from './src/mastra/index';

async function processPdfUrl(pdfUrl: string): Promise<void> {
  try {
    console.log(`🚀 Mastra PDF URL Processor`);
    console.log(`═══════════════════════════════════════════════════\n`);
    console.log(`🌐 Processing PDF URL: ${pdfUrl}\n`);
    
    // Run the PDF URL workflow
    const workflow = mastra.getWorkflow('pdfUrlWorkflow');
    const run = await workflow.createRunAsync();
    
    const result = await run.start({
      inputData: {
        pdfUrl: pdfUrl,
      },
    });
    
    if (result.status === 'success' && result.result) {
      const { 
        databasePath, 
        extractedFields, 
        documentType, 
        fileName, 
        fileSize 
      } = result.result;
      
      console.log(`✅ Processing completed successfully!`);
      console.log(`📄 Classified as: ${documentType}`);
      console.log(`📁 Downloaded file: ${fileName}`);
      console.log(`📊 File size: ${(fileSize / 1024).toFixed(1)} KB`);
      console.log(`✅ Extracted: ${extractedFields} fields`);
      console.log(`💾 Saved to database: ${path.basename(databasePath)}`);
      console.log(`📊 Total documents in database updated`);
      
    } else {
      throw new Error(`Workflow failed with status: ${result.status}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing PDF URL: ${error}`);
    process.exit(1);
  }
}

async function main() {
  // Check for API key
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ Error: GROQ_API_KEY environment variable is not set');
    console.error('Please add your Groq API key to the .env file:');
    console.error('GROQ_API_KEY=your_api_key_here');
    process.exit(1);
  }
  
  const args = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      help: {
        type: 'boolean',
        short: 'h',
        description: 'Show help message',
      },
    },
  });
  
  if (args.values.help) {
    console.log(`
🌐 Mastra PDF URL Processor

Usage:
  npx tsx pdfurl.ts <pdf_url>

Examples:
  npx tsx pdfurl.ts https://example.com/invoice.pdf
  npx tsx pdfurl.ts "https://example.com/contract.pdf"

IMPORTANT:
  • This tool is for downloading PDFs from HTTP/HTTPS URLs
  • For local PDF files, use: npx tsx processFiles.ts <file_path>

Options:
  -h, --help     Show this help message

Supported document types:
  • Invoices (client invoices, freelance invoices)
  • Contracts (service agreements, project contracts)  
  • Receipts (Stripe receipts, payment confirmations)

Output:
  • JSON files saved to ./outputs/ directory
  • Each PDF URL generates one JSON file with extracted data
    `);
    process.exit(0);
  }
  
  const pdfUrl = args.positionals[0];
  
  if (!pdfUrl) {
    console.error('❌ Error: Please provide a PDF URL');
    console.error('Use --help for usage information');
    process.exit(1);
  }
  
  // Validate URL format
  try {
    const urlObj = new URL(pdfUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      console.error('❌ Error: Only HTTP and HTTPS URLs are supported');
      console.error(`   You provided: ${urlObj.protocol}//...`);
      console.error('   For local files, use: npx tsx processFiles.ts <file_path>');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error: Invalid URL format');
    console.error('Please provide a valid HTTP/HTTPS URL like:');
    console.error('  https://example.com/document.pdf');
    console.error('');
    console.error('For local files, use the regular CLI:');
    console.error('  npx tsx processFiles.ts <file_path>');
    process.exit(1);
  }
  
  await processPdfUrl(pdfUrl);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
