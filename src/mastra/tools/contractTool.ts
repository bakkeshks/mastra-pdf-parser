import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

// Contract schema definition
const contractSchema = z.object({
  documentType: z.literal('contract'),
  clientName: z.string().describe('Client or company name'),
  startDate: z.string().describe('Contract start date'),
  endDate: z.string().describe('Contract end date'),
  paymentTerms: z.string().describe('Payment terms (e.g., Net 30, etc.)'),
  projectName: z.string().describe('Project or service description'),
  extractedAt: z.string().describe('Timestamp when data was extracted'),
});

export const contractTool = createTool({
  id: 'extract-contract-data',
  description: 'Extract structured data from contract PDFs',
  inputSchema: z.object({
    text: z.string().describe('Raw PDF text content'),
  }),
  outputSchema: contractSchema,
  execute: async ({ context }) => {
    const { text } = context;
    
    // Primary extraction prompt
    const primaryPrompt = `Extract the following fields from this contract or agreement text:

Required fields:
- clientName: Client or company name (the other party in the contract)
- startDate: Contract start date (format as YYYY-MM-DD if possible)
- endDate: Contract end date (format as YYYY-MM-DD if possible)
- paymentTerms: Payment terms (e.g., "Net 30", "Due on receipt", "Monthly", etc.)
- projectName: Project name, service description, or contract subject

Text to analyze:
${text}

Return ONLY a JSON object with the exact field names above. If a field cannot be found, use "Not specified" as the value.

Example format:
{
  "clientName": "Acme Corporation",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "paymentTerms": "Net 30",
  "projectName": "Website Development Services"
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
        documentType: 'contract' as const,
        ...extractedData,
        extractedAt: new Date().toISOString(),
      };

      // Validate against schema
      const validatedData = contractSchema.parse(finalData);
      return validatedData;

    } catch (error) {
      // Fallback extraction with simpler prompt
      console.warn('Primary extraction failed, trying fallback...', error);
      
      const fallbackPrompt = `From this contract text, extract the key details:

Text: ${text}

Return JSON with these fields:
- clientName: Who is the client/other party?
- startDate: When does the contract start?
- endDate: When does it end?
- paymentTerms: How will payment work?
- projectName: What's the project/service about?

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
          documentType: 'contract' as const,
          ...fallbackData,
          extractedAt: new Date().toISOString(),
        };

        return contractSchema.parse(finalData);
      } catch (fallbackError) {
        throw new Error(`Both primary and fallback extraction failed: ${fallbackError}`);
      }
    }
  },
});
