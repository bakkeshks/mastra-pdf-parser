# Input PDF Files

This directory is where you place PDF files for processing by the Mastra document extraction system.

## How to Use

1. **Add your PDF files** to this directory
2. **Run the processor**:
   ```bash
   # Process all PDFs in this directory
   npx tsx agent.ts ./input_pdfs/
   
   # Process a specific file
   npx tsx agent.ts ./input_pdfs/your-document.pdf
   ```

## Included Sample

- `invoice_notion.pdf` - Example invoice for testing

## Supported Document Types

- **📑 Invoices**: Bills, payment requests, freelance invoices
- **📋 Contracts**: Service agreements, terms of service, project contracts  
- **🧾 Receipts**: Payment confirmations, Stripe receipts, transaction records

## File Requirements

- Files must have `.pdf` extension
- PDFs should contain embedded text (not scanned images)
- Files should be readable and not password-protected
- Maximum recommended size: 10MB per file

## Output

Processed documents will be saved to:
- **Database**: `outputs/documents_database.json` (centralized storage)
- **Evaluation**: Run `npm run eval` to see quality scores

## Tips

- Use descriptive filenames for easier identification
- Remove password protection before processing
- Test with the included sample first to verify setup
