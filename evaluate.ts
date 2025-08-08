#!/usr/bin/env node

import 'dotenv/config';
import { parseArgs } from 'node:util';
import fs from 'fs';
import path from 'path';
import { evaluateExtractedData, printEvaluationReport } from './evals/docEval';
import { getDatabaseStats, searchDocuments } from './utils/jsonDatabase';

async function runDocumentEvaluation(): Promise<void> {
  try {
    console.log(`🧪 Mastra Document Extraction Evaluator`);
    console.log(`═══════════════════════════════════════════════════════`);
    
    // Get recent documents from database
    const recentDocs = searchDocuments(undefined, 10);
    
    if (recentDocs.length === 0) {
      console.log('❌ No documents found in database to evaluate.');
      console.log('Process some documents first using:');
      console.log('  npx tsx processFiles.ts <file_path>     # For local files');
      console.log('  npx tsx processUrl.ts <pdf_url>      # For PDF URLs');
      return;
    }

    console.log(`📊 Evaluating ${recentDocs.length} documents from database...\n`);

    let totalScore = 0;
    let evaluationCount = 0;
    const evaluationResults: any[] = [];

    for (const doc of recentDocs) {
      try {
        const { extractedData, fileName, documentType, filePath } = doc;
        
        console.log(`🔍 Evaluating: ${fileName}`);
        
        // Create evaluation query based on document type
        const inputQuery = `Extract structured data from this ${documentType} document`;
        
        // Run evaluation
        const evaluation = await evaluateExtractedData(extractedData, undefined, inputQuery);
        
        evaluationResults.push({
          fileName,
          documentType,
          score: evaluation.score,
          completeness: evaluation.completeness,
          fieldAccuracy: evaluation.fieldAccuracy,
          formatCompliance: evaluation.formatCompliance,
          dataQuality: evaluation.dataQuality,
          missingFields: evaluation.missingFields,
          errors: evaluation.errors,
          warnings: evaluation.warnings,
          qualityIssues: evaluation.qualityIssues
        });
        
        totalScore += evaluation.score;
        evaluationCount++;
        
        // Print individual report
        console.log(`\n📊 Document: ${fileName}`);
        console.log(`📄 Type: ${documentType}`);
        console.log(`🎯 Score: ${evaluation.score.toFixed(1)}/100`);
        console.log(`📋 Completeness: ${evaluation.completeness.toFixed(1)}%`);
        console.log(`🎯 Field Accuracy: ${evaluation.fieldAccuracy.toFixed(1)}%`);
        console.log(`📝 Format Compliance: ${evaluation.formatCompliance.toFixed(1)}%`);
        console.log(`💎 Data Quality: ${evaluation.dataQuality.toFixed(1)}%`);
        
        if (evaluation.missingFields.length > 0) {
          console.log(`❌ Missing: ${evaluation.missingFields.join(', ')}`);
        }
        
        if (evaluation.errors.length > 0) {
          console.log(`🚨 Errors: ${evaluation.errors.length}`);
        }
        
        if (evaluation.warnings.length > 0) {
          console.log(`⚠️  Warnings: ${evaluation.warnings.length}`);
        }
        
        console.log(`─────────────────────────────────────────`);
        
      } catch (evalError) {
        console.error(`❌ Failed to evaluate ${doc.fileName}: ${evalError}`);
      }
    }

    // Print summary report
    console.log(`\n🎯 Evaluation Summary`);
    console.log(`═══════════════════════════════════════════════════════`);
    console.log(`📊 Documents Evaluated: ${evaluationCount}`);
    console.log(`🎯 Average Score: ${evaluationCount > 0 ? (totalScore / evaluationCount).toFixed(1) : 0}/100`);
    
    // Database stats
    const dbStats = getDatabaseStats();
    console.log(`\n📈 Database Statistics:`);
    console.log(`   📄 Total Documents: ${dbStats.total}`);
    console.log(`   📑 Invoices: ${dbStats.invoices}`);
    console.log(`   📋 Contracts: ${dbStats.contracts}`);
    console.log(`   🧾 Receipts: ${dbStats.receipts}`);
    
    // Quality distribution
    const scoreRanges = {
      excellent: evaluationResults.filter(r => r.score >= 90).length,
      good: evaluationResults.filter(r => r.score >= 70 && r.score < 90).length,
      fair: evaluationResults.filter(r => r.score >= 50 && r.score < 70).length,
      poor: evaluationResults.filter(r => r.score < 50).length,
    };
    
    console.log(`\n📊 Quality Distribution:`);
    console.log(`   🏆 Excellent (90-100): ${scoreRanges.excellent}`);
    console.log(`   ✅ Good (70-89): ${scoreRanges.good}`);
    console.log(`   ⚠️  Fair (50-69): ${scoreRanges.fair}`);
    console.log(`   ❌ Poor (<50): ${scoreRanges.poor}`);
    
    // Top issues
    const allIssues: string[] = [];
    evaluationResults.forEach(r => {
      allIssues.push(...r.errors, ...r.warnings, ...r.qualityIssues);
    });
    
    const issueFrequency: { [key: string]: number } = {};
    allIssues.forEach(issue => {
      const key = issue.split(':')[0]; // Get the field name part
      issueFrequency[key] = (issueFrequency[key] || 0) + 1;
    });
    
    const topIssues = Object.entries(issueFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    if (topIssues.length > 0) {
      console.log(`\n🔍 Common Issues:`);
      topIssues.forEach(([issue, count]) => {
        console.log(`   • ${issue}: ${count} occurrences`);
      });
    }
    
    console.log(`═══════════════════════════════════════════════════════`);
    
  } catch (error) {
    console.error(`❌ Evaluation failed: ${error}`);
    process.exit(1);
  }
}

async function evaluateSingleFile(filePath: string): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const fileName = path.basename(filePath);
    
    console.log(`🧪 Evaluating Single File: ${fileName}`);
    console.log(`═══════════════════════════════════════════════════════`);
    
    const inputQuery = `Extract structured data from this document`;
    const evaluation = await evaluateExtractedData(data, undefined, inputQuery);
    
    printEvaluationReport(data, filePath);
    
  } catch (error) {
    console.error(`❌ Single file evaluation failed: ${error}`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      help: {
        type: 'boolean',
        short: 'h',
        description: 'Show help message',
      },
      file: {
        type: 'string',
        short: 'f',
        description: 'Evaluate a specific JSON file',
      },
    },
  });
  
  if (args.values.help) {
    console.log(`
🧪 Mastra Document Extraction Evaluator

Usage:
  npx tsx eval.ts                    # Evaluate all documents in database
  npx tsx eval.ts -f <json_file>     # Evaluate specific JSON file

Examples:
  npx tsx eval.ts                              # Run evaluation on all processed documents
  npx tsx eval.ts -f outputs/invoice.json     # Evaluate specific extracted data file

Options:
  -h, --help     Show this help message
  -f, --file     Evaluate a specific JSON file

Features:
  🎯 Quality scoring (0-100)
  📋 Completeness analysis
  📝 Format compliance checking
  💎 Data quality assessment
  🔍 Issue identification
  📊 Database statistics
  📈 Quality distribution analysis

Evaluation Metrics:
  • Completeness (35%): Required fields extracted
  • Field Accuracy (30%): Meaningful data quality
  • Format Compliance (20%): Correct data formats
  • Data Quality (15%): Overall content quality
    `);
    process.exit(0);
  }
  
  if (args.values.file) {
    await evaluateSingleFile(args.values.file);
  } else {
    await runDocumentEvaluation();
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
