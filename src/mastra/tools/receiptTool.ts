import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

// Receipt schema definition
const receiptSchema = z.object({
  documentType: z.literal('receipt'),
  date: z.string().describe('Transaction date'),
  customerEmail: z.string().describe('Customer email address'),
  amount: z.string().describe('Transaction amount with currency'),
  description: z.string().describe('Transaction description or service'),
  extractedAt: z.string().describe('Timestamp when data was extracted'),
});

export const receiptTool = createTool({
  id: 'extract-receipt-data',
  description: 'Extract structured data from receipt PDFs (especially Stripe receipts)',
  inputSchema: z.object({
    text: z.string().describe('Raw PDF text content'),
  }),
  outputSchema: receiptSchema,
  execute: async ({ context }) => {
    const { text } = context;
    
    // Primary extraction prompt
    const primaryPrompt = `Extract the following fields from this receipt or payment confirmation text:

Required fields:
- date: Transaction or payment date (format as YYYY-MM-DD if possible)
- customerEmail: Customer's email address
- amount: Transaction amount (include currency symbol like $, €, etc.)
- description: Description of the service/product or transaction purpose

Text to analyze:
${text}

Return ONLY a JSON object with the exact field names above. If a field cannot be found, use "Not found" as the value.

Example format:
{
  "date": "2025-08-01",
  "customerEmail": "customer@example.com",
  "amount": "$29.99",
  "description": "Monthly subscription"
}`;

    try {
      // Try primary extraction
      const result = await generateText({
        model: groq('llama3-70b-8192'),
        prompt: primaryPrompt,
        temperature: 0.1,
        maxTokens: 1000,
      });

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
        documentType: 'receipt' as const,
        ...extractedData,
        extractedAt: new Date().toISOString(),
      };

      // Validate against schema
      const validatedData = receiptSchema.parse(finalData);
      return validatedData;

    } catch (error) {
      // Fallback extraction with simpler prompt
      console.warn('Primary extraction failed, trying fallback...', error);
      
      const fallbackPrompt = `From this receipt text, extract the payment details:

Text: ${text}

Return JSON with these fields:
- date: When was the payment made?
- customerEmail: What's the customer's email?
- amount: How much was paid?
- description: What was purchased/paid for?

Use "Unknown" if you can't find a field.`;

      try {
        const fallbackResult = await generateText({
          model: groq('llama3-70b-8192'),
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
          documentType: 'receipt' as const,
          ...fallbackData,
          extractedAt: new Date().toISOString(),
        };

        return receiptSchema.parse(finalData);
      } catch (fallbackError) {
        throw new Error(`Both primary and fallback extraction failed: ${fallbackError}`);
      }
    }
  },
});
