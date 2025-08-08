#!/usr/bin/env node

import 'dotenv/config';
import { parseArgs } from 'node:util';
import * as fs from 'fs';
import * as path from 'path';
import { mastra } from './src/mastra/index';
import { extractTextFromPdf, validatePdfFile } from './utils/parsePdfText';
import * as docEval from './evals/docEval';
import { getDatabaseStats, JSON_DATABASE_PATH } from './utils/jsonDatabase';

interface ProcessingStats {
  total: number;
  success: number;
  errors: number;
  startTime: number;
}

async function processPdfFile(filePath: string, stats: ProcessingStats, showEval: boolean = false): Promise<boolean> {
  const fileName = path.basename(filePath);
  
  try {
    console.log(`🔍 Processing: ${fileName}`);
    
    // Validate PDF file
    if (!validatePdfFile(filePath)) {
      throw new Error('Invalid PDF file or file not accessible');
    }
    
    // Extract text from PDF
    console.log(`📄 Extracting text...`);
    const extractedText = await extractTextFromPdf(filePath);
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from PDF');
    }
    
    // Run the workflow
    console.log(`🤖 Processing with AI...`);
    const workflow = mastra.getWorkflow('docParseWorkflow');
    const run = await workflow.createRunAsync();
    
    const result = await run.start({
      inputData: {
        text: extractedText,
        filePath: filePath,
      },
    });
    
    if (result.status === 'success' && result.result) {
      const { outputPath, extractedFields, documentType } = result.result;
      
      // If documentType is undefined, read it from the output JSON
      const classifiedType = documentType || 'unknown';
      
      console.log(`📄 Classified as: ${classifiedType}`);
      console.log(`✅ Extracted: ${extractedFields} fields`);
      console.log(`💾 Saved to JSON: ${path.relative(process.cwd(), outputPath)}`);
      
      // Show database stats
      const dbStats = getDatabaseStats();
      console.log(`📊 Database: ${dbStats.invoices} invoices, ${dbStats.contracts} contracts, ${dbStats.receipts} receipts (${dbStats.total} total)`);
      
      // Run evaluation if enabled
      if (showEval) {
        try {
          // Read the latest record from the JSON database
          const dbPath = path.join(process.cwd(), 'outputs', 'documents_database.json');
          if (fs.existsSync(dbPath)) {
            const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            const documents = dbContent.documents || [];
            if (documents.length > 0) {
              // Get the latest document (last in array)
              const latestDoc = documents[documents.length - 1];
              docEval.printEvaluationReport(latestDoc.extractedData, filePath, extractedText);
            }
          }
        } catch (evalError) {
          console.log(`⚠️  Evaluation skipped: ${evalError}`);
        }
      }
      
      stats.success++;
      return true;
    } else {
      throw new Error(`Workflow failed with status: ${result.status}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${fileName}: ${error}`);
    stats.errors++;
    return false;
  }
}

async function processDirectory(dirPath: string): Promise<void> {
  const stats: ProcessingStats = {
    total: 0,
    success: 0,
    errors: 0,
    startTime: Date.now(),
  };
  
  try {
    const files = fs.readdirSync(dirPath);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      console.log(`📁 No PDF files found in: ${dirPath}`);
      return;
    }
    
    console.log(`📁 Found ${pdfFiles.length} PDF file(s) in: ${dirPath}`);
    console.log(`🚀 Starting batch processing...\n`);
    
    stats.total = pdfFiles.length;
    
    for (const file of pdfFiles) {
      const fullPath = path.join(dirPath, file);
      await processPdfFile(fullPath, stats, false); // No eval for batch processing
      console.log(''); // Add spacing between files
    }
    
  } catch (error) {
    console.error(`❌ Error reading directory: ${error}`);
    return;
  }
  
  // Print summary
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const dbStats = getDatabaseStats();
  
  console.log(`📊 Batch Processing Summary:`);
  console.log(`═══════════════════════════════════════`);
  console.log(`📁 Total files: ${stats.total}`);
  console.log(`✅ Successful: ${stats.success}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`📈 Success rate: ${((stats.success / stats.total) * 100).toFixed(1)}%`);
  console.log(`📊 Database totals: ${dbStats.invoices} invoices, ${dbStats.contracts} contracts, ${dbStats.receipts} receipts`);
  console.log(`💾 JSON database: ${path.relative(process.cwd(), JSON_DATABASE_PATH)}`);
  console.log(`═══════════════════════════════════════\n`);
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
      eval: {
        type: 'boolean',
        short: 'e',
        description: 'Show detailed evaluation report',
      },
      debug: {
        type: 'boolean',
        short: 'd',
        description: 'Enable debug logging',
      },
    },
  });
  
  if (args.values.help) {
    console.log(`
📄 Mastra DocOps Pro - PDF Document Processing Agent

Usage:
  npx tsx processFiles.ts <file_or_directory> [options]

Examples:
  npx tsx processFiles.ts ./input_pdfs/invoice.pdf     # Process single file
  npx tsx processFiles.ts ./input_pdfs/                # Process all PDFs in directory

Options:
  -h, --help     Show this help message
  -e, --eval     Show detailed evaluation report
  -d, --debug    Enable debug logging

Supported document types:
  • Invoices (client invoices, freelance invoices)
  • Contracts (service agreements, project contracts)  
  • Receipts (Stripe receipts, payment confirmations)

Output:
  • Single JSON database saved to ./outputs/documents_database.json
  • All documents accumulated with timestamps and metadata
  • Each record includes full extraction data and processing info
    `);
    process.exit(0);
  }
  
  const input = args.positionals[0];
  
  if (!input) {
    console.error('❌ Error: Please provide a PDF file or directory path');
    console.error('Use --help for usage information');
    process.exit(1);
  }
  
  // Check if input exists
  if (!fs.existsSync(input)) {
    console.error(`❌ Error: File or directory not found: ${input}`);
    process.exit(1);
  }
  
  const inputStat = fs.statSync(input);
  
  console.log(`🚀 Mastra DocOps Pro - PDF Document Processing`);
  console.log(`═══════════════════════════════════════════════════\n`);
  
  if (inputStat.isFile()) {
    // Process single file
    if (!input.toLowerCase().endsWith('.pdf')) {
      console.error('❌ Error: File must have .pdf extension');
      process.exit(1);
    }
    
    const stats: ProcessingStats = {
      total: 1,
      success: 0,
      errors: 0,
      startTime: Date.now(),
    };
    
    const success = await processPdfFile(input, stats, args.values.eval || false);
    
    if (success && args.values.eval) {
      console.log(`ℹ️  Evaluation completed above`);
    }
    
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    console.log(`\n⏱️  Completed in ${duration}s`);
    
  } else if (inputStat.isDirectory()) {
    // Process directory
    await processDirectory(input);
  } else {
    console.error('❌ Error: Input must be a PDF file or directory');
    process.exit(1);
  }
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
