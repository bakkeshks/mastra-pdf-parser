import { z } from 'zod';
import { groq } from '@ai-sdk/groq';
import {
  AnswerRelevancyMetric,
  FaithfulnessMetric,
  HallucinationMetric,
} from "@mastra/evals/llm";

import {
  CompletenessMetric,
  ContentSimilarityMetric,
  KeywordCoverageMetric,
} from "@mastra/evals/nlp";

// Initialize model for LLM-based scorers
const model = groq('llama3-70b-8192');

// Create Mastra scorers for document evaluation (simplified for extraction focus)
export const documentScorers = {
  // Only use Answer Relevancy as it's most relevant for extraction quality
  answerRelevancy: new AnswerRelevancyMetric(model),
};

// Document validation schemas
const baseDocumentSchema = z.object({
  documentType: z.enum(['invoice', 'contract', 'receipt']),
  extractedAt: z.string(),
});

const invoiceEvalSchema = baseDocumentSchema.extend({
  documentType: z.literal('invoice'),
  client: z.string().min(1, 'Client name is required'),
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  totalAmount: z.string().min(1, 'Total amount is required'),
  currency: z.string().min(1, 'Currency is required'),
  dueDate: z.string().min(1, 'Due date is required'),
});

const contractEvalSchema = baseDocumentSchema.extend({
  documentType: z.literal('contract'),
  clientName: z.string().min(1, 'Client name is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  paymentTerms: z.string().min(1, 'Payment terms are required'),
  projectName: z.string().min(1, 'Project name is required'),
});

const receiptEvalSchema = baseDocumentSchema.extend({
  documentType: z.literal('receipt'),
  date: z.string().min(1, 'Date is required'),
  customerEmail: z.string().min(1, 'Customer email is required'),
  amount: z.string().min(1, 'Amount is required'),
  description: z.string().min(1, 'Description is required'),
});

interface DocumentExtractionResult {
  isValid: boolean;
  score: number;
  completeness: number;
  fieldAccuracy: number;
  formatCompliance: number;
  dataQuality: number;
  extractionConfidence: number;
  errors: string[];
  warnings: string[];
  qualityIssues: string[];
  fieldCount: number;
  missingFields: string[];
  documentType: string;
}

// Enhanced evaluation using document-extraction specific metrics
export async function evaluateExtractedData(
  data: unknown,
  originalText?: string,
  inputQuery?: string
): Promise<DocumentExtractionResult> {
  
  const result: DocumentExtractionResult = {
    isValid: false,
    score: 0,
    completeness: 0,
    fieldAccuracy: 0,
    formatCompliance: 0,
    dataQuality: 0,
    extractionConfidence: 0,
    errors: [],
    warnings: [],
    qualityIssues: [],
    fieldCount: 0,
    missingFields: [],
    documentType: 'unknown',
  };

  try {
    // Basic validation
    if (!data || typeof data !== 'object') {
      result.errors.push('Invalid data structure: not an object');
      return result;
    }

    const docData = data as Record<string, any>;
    result.fieldCount = Object.keys(docData).length;
    result.documentType = docData.documentType || 'unknown';

    // Schema validation
    let schema: z.ZodSchema;
    let expectedFields: string[];

    switch (docData.documentType) {
      case 'invoice':
        schema = invoiceEvalSchema;
        expectedFields = ['client', 'invoiceNumber', 'totalAmount', 'currency', 'dueDate'];
        break;
      case 'contract':
        schema = contractEvalSchema;
        expectedFields = ['clientName', 'startDate', 'endDate', 'paymentTerms', 'projectName'];
        break;
      case 'receipt':
        schema = receiptEvalSchema;
        expectedFields = ['date', 'customerEmail', 'amount', 'description'];
        break;
      default:
        result.errors.push(`Unsupported document type: ${docData.documentType}`);
        return result;
    }

    // Validate against schema
    const validationResult = schema.safeParse(data);
    result.isValid = validationResult.success;

    if (!validationResult.success) {
      result.errors.push(...validationResult.error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ));
    }

    // Calculate Field Completeness (traditional completeness)
    const presentFields = expectedFields.filter(field => {
      const value = docData[field];
      return value && 
             typeof value === 'string' && 
             value.trim() !== '' && 
             value.toLowerCase() !== 'not found' &&
             value.toLowerCase() !== 'unknown' &&
             value.toLowerCase() !== 'not specified';
    });

    result.completeness = (presentFields.length / expectedFields.length) * 100;
    result.missingFields = expectedFields.filter(field => !presentFields.includes(field));

    // Calculate Field Accuracy (non-placeholder content quality)
    let fieldAccuracyCount = 0;
    expectedFields.forEach(field => {
      const value = docData[field];
      if (value && typeof value === 'string' && value.trim() !== '') {
        const cleanValue = value.trim().toLowerCase();
        // Field is accurate if it's not a placeholder and has meaningful content
        if (cleanValue !== 'not found' && 
            cleanValue !== 'unknown' && 
            cleanValue !== 'not specified' &&
            cleanValue !== 'n/a' &&
            cleanValue !== 'null' &&
            value.trim().length > 1) {
          fieldAccuracyCount++;
        }
      }
    });
    result.fieldAccuracy = expectedFields.length > 0 ? (fieldAccuracyCount / expectedFields.length) * 100 : 0;

    // Calculate Format Compliance (correct data formats)
    let formatComplianceCount = 0;
    let formatChecksTotal = 0;
    
    expectedFields.forEach(field => {
      const value = docData[field];
      if (value && typeof value === 'string' && value.trim() !== '') {
        const cleanValue = value.trim().toLowerCase();
        
        if (cleanValue === 'not found' || cleanValue === 'unknown' || cleanValue === 'not specified') {
          return; // Skip format check for missing data
        }
        
        // Email format validation
        if (field.includes('email') || field.includes('Email')) {
          formatChecksTotal++;
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(value.trim())) {
            formatComplianceCount++;
          } else {
            result.qualityIssues.push(`${field}: Invalid email format`);
          }
        }
        
        // Date format validation (flexible)
        else if (field.includes('date') || field.includes('Date')) {
          formatChecksTotal++;
          const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4}|\w+\s+\d{1,2},?\s+\d{4})$/;
          if (dateRegex.test(value.trim())) {
            formatComplianceCount++;
          } else {
            result.qualityIssues.push(`${field}: Unusual date format`);
          }
        }
        
        // Amount/currency format validation
        else if (field.includes('amount') || field.includes('Amount') || field.includes('total')) {
          formatChecksTotal++;
          const amountRegex = /^[\$€£¥]?\s*\d+([,\d]*)?(\.\d{2})?$|^\d+([,\d]*)?(\.\d{2})?\s*[\$€£¥]?$/;
          if (amountRegex.test(value.trim())) {
            formatComplianceCount++;
          } else {
            result.qualityIssues.push(`${field}: Currency format could be improved`);
          }
        }
        
        // Invoice/contract number format
        else if (field.includes('number') || field.includes('Number')) {
          formatChecksTotal++;
          if (value.trim().length >= 2 && value.trim().length <= 50) {
            formatComplianceCount++;
          } else {
            result.qualityIssues.push(`${field}: Unusual number format`);
          }
        }
        
        // General string fields (non-empty, reasonable length)
        else {
          formatChecksTotal++;
          if (value.trim().length >= 2 && value.trim().length <= 200) {
            formatComplianceCount++;
          } else {
            result.qualityIssues.push(`${field}: Unusual content length`);
          }
        }
      }
    });
    
    result.formatCompliance = formatChecksTotal > 0 ? (formatComplianceCount / formatChecksTotal) * 100 : 100;

    // Calculate Data Quality Score (comprehensive content assessment)
    let qualityPoints = 0;
    let maxQualityPoints = expectedFields.length * 3; // Max 3 points per field
    
    expectedFields.forEach(field => {
      const value = docData[field];
      if (value && typeof value === 'string') {
        const cleanValue = value.trim().toLowerCase();
        
        // 1 point for presence
        if (cleanValue !== '') qualityPoints += 1;
        
        // 1 point for not being placeholder
        if (cleanValue !== 'not found' && 
            cleanValue !== 'unknown' && 
            cleanValue !== 'not specified' &&
            cleanValue !== 'n/a') {
          qualityPoints += 1;
        }
        
        // 1 point for reasonable content (not too short/long, not generic)
        if (cleanValue.length >= 2 && 
            cleanValue.length <= 100 && 
            cleanValue !== 'not found' && 
            cleanValue !== 'unknown' &&
            !cleanValue.includes('placeholder') &&
            !cleanValue.includes('example')) {
          qualityPoints += 1;
        }
      }
    });
    
    result.dataQuality = maxQualityPoints > 0 ? (qualityPoints / maxQualityPoints) * 100 : 0;

    // Use LLM-based evaluation if available (Answer Relevancy for extraction confidence)
    if (originalText && inputQuery) {
      try {
        const outputText = JSON.stringify(docData, null, 2);
        const relevancyResult = await documentScorers.answerRelevancy.measure(
          inputQuery,
          outputText
        );
        result.extractionConfidence = relevancyResult.score * 100;
      } catch (scorerError) {
        result.warnings.push(`LLM-based confidence evaluation failed: ${scorerError}`);
      }
    }

    // Quality checks and warnings
    expectedFields.forEach(field => {
      const value = docData[field];
      
      if (!value || typeof value !== 'string') {
        result.warnings.push(`Field '${field}' is missing or invalid type`);
        return;
      }

      const cleanValue = value.trim().toLowerCase();
      
      if (cleanValue === 'not found' || cleanValue === 'unknown' || cleanValue === 'not specified') {
        result.warnings.push(`Field '${field}' has placeholder value: ${value}`);
      }
      
      if (cleanValue.length < 2) {
        result.warnings.push(`Field '${field}' has very short content`);
      }
    });

    // Calculate overall score with document-extraction focus
    const weights = {
      completeness: 0.35,      // 35% - most important for extraction
      fieldAccuracy: 0.30,     // 30% - data accuracy is crucial
      formatCompliance: 0.20,  // 20% - format correctness
      dataQuality: 0.15        // 15% - general quality
    };
    
    let baseScore = (
      result.completeness * weights.completeness +
      result.fieldAccuracy * weights.fieldAccuracy +
      result.formatCompliance * weights.formatCompliance +
      result.dataQuality * weights.dataQuality
    );
    
    // Enhance score with LLM confidence if available (small weight)
    if (result.extractionConfidence > 0) {
      baseScore = (baseScore * 0.9) + (result.extractionConfidence * 0.1);
    }
    
    // Apply penalties (reduced for extraction context)
    const warningPenalty = result.warnings.length * 2;  // Light penalty for warnings
    const errorPenalty = result.errors.length * 8;      // Moderate penalty for errors
    
    result.score = Math.max(0, Math.min(100, baseScore - warningPenalty - errorPenalty));

    return result;

  } catch (error) {
    result.errors.push(`Evaluation failed: ${error}`);
    return result;
  }
}

export function printEvaluationReport(data: unknown, filePath: string, originalText?: string): void {
  const inputQuery = `Extract structured data from this ${filePath.includes('invoice') ? 'invoice' : 
                       filePath.includes('contract') ? 'contract' : 'receipt'} document`;
  
  // Use async wrapper since evaluateExtractedData is now async
  evaluateExtractedData(data, originalText, inputQuery).then(evaluation => {
    console.log(`\n📊 Document Extraction Quality Report`);
    console.log(`═════════════════════════════════════════════════════════`);
    console.log(`📁 File: ${filePath}`);
    console.log(`📄 Type: ${evaluation.documentType}`);
    console.log(`✅ Schema Valid: ${evaluation.isValid ? 'Yes' : 'No'}`);
    console.log(`🎯 Overall Score: ${evaluation.score.toFixed(1)}/100`);
    
    console.log(`\n📊 Extraction Quality Metrics:`);
    console.log(`   📋 Completeness: ${evaluation.completeness.toFixed(1)}% (required fields extracted)`);
    console.log(`   🎯 Field Accuracy: ${evaluation.fieldAccuracy.toFixed(1)}% (meaningful data quality)`);
    console.log(`   📝 Format Compliance: ${evaluation.formatCompliance.toFixed(1)}% (correct data formats)`);
    console.log(`   💎 Data Quality: ${evaluation.dataQuality.toFixed(1)}% (overall content quality)`);
    
    if (evaluation.extractionConfidence > 0) {
      console.log(`   🤖 AI Confidence: ${evaluation.extractionConfidence.toFixed(1)}% (extraction relevance)`);
    }
    
    console.log(`\n🔢 Field Summary:`);
    console.log(`   Fields Found: ${evaluation.fieldCount}`);
    console.log(`   Complete Fields: ${evaluation.fieldCount - evaluation.missingFields.length}/${evaluation.fieldCount}`);
    
    if (evaluation.missingFields.length > 0) {
      console.log(`   ❌ Missing Fields: ${evaluation.missingFields.join(', ')}`);
    }
    
    if (evaluation.qualityIssues.length > 0) {
      console.log(`\n🔍 Quality Notes:`);
      evaluation.qualityIssues.slice(0, 5).forEach(issue => console.log(`   • ${issue}`));
      if (evaluation.qualityIssues.length > 5) {
        console.log(`   ... and ${evaluation.qualityIssues.length - 5} more`);
      }
    }
    
    if (evaluation.errors.length > 0) {
      console.log(`\n🚨 Errors:`);
      evaluation.errors.forEach(error => console.log(`   • ${error}`));
    }
    
    if (evaluation.warnings.length > 0) {
      console.log(`\n⚠️  Warnings:`);
      evaluation.warnings.slice(0, 3).forEach(warning => console.log(`   • ${warning}`));
      if (evaluation.warnings.length > 3) {
        console.log(`   ... and ${evaluation.warnings.length - 3} more`);
      }
    }
    
    console.log(`═════════════════════════════════════════════════════════\n`);
  }).catch(error => {
    console.error(`❌ Evaluation report failed: ${error}`);
  });
}
