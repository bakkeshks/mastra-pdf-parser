import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

// Invoice schema definition
const invoiceSchema = z.object({
  documentType: z.literal('invoice'),
  client: z.string().describe('Client or company name'),
  invoiceNumber: z.string().describe('Invoice number or ID'),
  totalAmount: z.string().describe('Total amount due with currency symbol'),
  currency: z.string().describe('Currency code (USD, EUR, etc.)'),
  dueDate: z.string().describe('Payment due date'),
  extractedAt: z.string().describe('Timestamp when data was extracted'),
});

export const invoiceTool = createTool({
  id: 'extract-invoice-data',
  description: 'Extract structured data from invoice PDFs',
  inputSchema: z.object({
    text: z.string().describe('Raw PDF text content'),
  }),
  outputSchema: invoiceSchema,
  execute: async ({ context }) => {
    const { text } = context;
    
    // Primary extraction prompt
    const primaryPrompt = `Extract the following fields from this invoice text:

Required fields:
- client: Company or person name (who is being billed)
- invoiceNumber: Invoice ID or reference number
- totalAmount: Total amount due (include currency symbol like $, €, etc.)
- currency: Currency code (USD, EUR, GBP, etc.)
- dueDate: Payment due date (format as YYYY-MM-DD if possible)

Text to analyze:
${text}

Return ONLY a JSON object with the exact field names above. If a field cannot be found, use "Not found" as the value.

Example format:
{
  "client": "Acme Corp",
  "invoiceNumber": "INV-001",
  "totalAmount": "$1,200.00",
  "currency": "USD",
  "dueDate": "2025-09-15"
}`;

    try {
      console.log('🤖 Starting invoice data extraction...');
      // Try primary extraction
      const result = await generateText({
        model: groq('llama3-70b-8192'), // Switch to faster model
        prompt: primaryPrompt,
        temperature: 0.1,
        maxTokens: 1000, // Add token limit
      });
      console.log('🤖 AI extraction completed, parsing response...');

      // Parse the JSON response
      let extractedData;
      try {
        // Clean the response to extract JSON
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        extractedData = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${parseError}`);
      }

      // Add metadata
      const finalData = {
        documentType: 'invoice' as const,
        ...extractedData,
        extractedAt: new Date().toISOString(),
      };

      console.log('✅ Invoice data parsed successfully');
      // Validate against schema
      const validatedData = invoiceSchema.parse(finalData);
      console.log('✅ Invoice data validated against schema');
      return validatedData;

    } catch (error) {
      // Fallback extraction with simpler prompt
      console.warn('Primary extraction failed, trying fallback...', error);
      
      const fallbackPrompt = `From this invoice text, extract just the key information:

Text: ${text}

Return JSON with these fields:
- client: Who is being billed?
- invoiceNumber: What's the invoice number?
- totalAmount: What's the total amount?
- currency: What currency?
- dueDate: When is payment due?

Use "Unknown" if you can't find a field.`;

      try {
        const fallbackResult = await generateText({
          model: groq('llama3-70b-8192'), // Use same faster model
          prompt: fallbackPrompt,
          temperature: 0.2,
          maxTokens: 800,
        });

        const jsonMatch = fallbackResult.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Fallback extraction also failed');
        }

        const fallbackData = JSON.parse(jsonMatch[0]);
        const finalData = {
          documentType: 'invoice' as const,
          ...fallbackData,
          extractedAt: new Date().toISOString(),
        };

        return invoiceSchema.parse(finalData);
      } catch (fallbackError) {
        throw new Error(`Both primary and fallback extraction failed: ${fallbackError}`);
      }
    }
  },
});
