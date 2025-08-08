# Mastra PDF Document Parser

A Mastra agent template for auto classifying and extracting structured data from business PDFs (invoices, contracts, receipts).

### Problem Statement

Freelancers, indie hackers, and small SaaS teams deal with business documents like:
- Invoices from Stripe, Wise, clients
- Signed contracts (PDF)
- Stripe receipts

They manually extract and log key data (e.g. client name, amount, date) into spreadsheets, Notion, or a database.

### This is:
- Time-consuming, Repetitive, Prone to manual errors
- Unscalable past 50+ documents/month

## Solution

- Accepts PDF files via CLI or Web UI (Mastra Playground)
- Auto-classifies type: invoice, contract, or receipt
- Uses Mastra agents + tools + workflow
- Validates JSON output using Zod
- Supports single file or batch folder
- Logs outputs to `/outputs/*.json`

## Why Mastra AI Is the Right Framework

- 🤖 AI Agent Orchestration: Built-in Agent, Tool, and Workflow system for complex document processing
- 🧩 Prompt Modularity: One custom prompt per document type (invoice, contract, receipt)
- ✅ Output Validation: Zod schemas inside each tool file ensure data quality
- 📊 Built-in Evaluation : Compares structured results against expected outputs
- 💻 Developer-First: TypeScript, CLI-first approach for fast prototyping
- ⚡ High Performance: Uses Groq for fast AI inference (llama3-70b-8192)
- 🔧 Production-Ready: Handles batch processing of 100s of documents

## Use Cases

1. Log contract metadata into Supabase
2. Match Stripe payouts with client invoices  
3. Migrate 500+ legacy invoices with zero copy-paste

## 🛠️ Installation

### Prerequisites
- Node.js 20.9.0 or higher
- npm

### Setup
```bash
# Clone or download the project
cd mastra-pdf-parser

# Install dependencies
npm install

# Copy environment file and add your API keys
cp .env.example .env

# Edit .env with your API keys:
# GROQ_API_KEY=your_groq_api_key_here
```

### Required API Keys
- **Groq API Key**: Get from [groq.com](https://groq.com)

## 🚀 How to Use

### Option 1: Mastra Playground (Web UI)
1. **Start Mastra Playground**:
   ```bash
   npm run dev
   ```
   Open: http://localhost:4111/agents/pdfAgent
  
   add Sample URL: https://slicedinvoices.com/pdf/wordpress-pdf-invoice-plugin-sample.pdf
   - **⚠️ Note**: Don't upload PDFs from local computer - it won't work
   - **Use URLs only** in the playground

### Option 2: CLI Processing (Recommended for Batch)

#### 1. Add Input PDFs
Place your PDF files in the `input_pdfs/` folder:
```bash
cp your-invoice.pdf input_pdfs/
cp your-contract.pdf input_pdfs/
```

#### 2. Process Local Files
```bash
# Process single file
npx tsx processFiles.ts input_pdfs/your-invoice.pdf

# Process all files in folder (BATCH PROCESSING)
npx tsx processFiles.ts input_pdfs/

# Batch with evaluation report
npx tsx processFiles.ts input_pdfs/ --eval

```

## 📊 Output

All processed documents are saved to `outputs/documents_database.json`:

```json
{
  "version": "1.0.0",
  "totalDocuments": 3,
  "documents": [
    {
      "id": "invoice_001",
      "fileName": "stripe-invoice.pdf",
      "documentType": "invoice",
      "extractedData": {
        "client": "Acme Corp",
        "invoiceNumber": "INV-001",
        "totalAmount": "$1,250.00",
        "currency": "USD",
        "dueDate": "2025-09-01"
      },
      "metadata": {
        "extractedFields": 5,
        "qualityScore": 95.0
      }
    }
  ]
}
```

## 📊 Evaluation System

Get quality scores for your extractions:

```bash
npm run eval
```

Output:
```
 Evaluation Summary
═══════════════════════════════════════════════════════
📊 Documents Evaluated: 7
🎯 Average Score: 99.1/100

📈 Database Statistics:
   📄 Total Documents: 7
   📑 Invoices: 3
   📋 Contracts: 2
   🧾 Receipts: 2

📊 Quality Distribution:
   🏆 Excellent (90-100): 7
   ✅ Good (70-89): 0
   ⚠️  Fair (50-69): 0
   ❌ Poor (<50): 0

🔍 Common Issues:
   • amount: 1 occurrences
```

## 🎯 Quick Start Example

### Method 1: Mastra Playground (Web UI)
1. **Start the playground**: `npx mastra dev`
2. **Open**: http://localhost:4111/agents  
3. **Test URL**: https://slicedinvoices.com/pdf/wordpress-pdf-invoice-plugin-sample.pdf
4. **⚠️ Important**: Use URLs only - local file upload won't work

### Method 2: CLI Batch Processing
1. **Install**: `npm install`
2. **Setup**: Add your `GROQ_API_KEY` to `.env`
3. **Add PDFs**: Copy PDFs to `input_pdfs/`
4. **Batch Process**: `npx tsx processFiles.ts input_pdfs/`
5. **Evaluate**: `npx tsx evaluate.ts`

### Batch Processing Commands
```bash
# Process all PDFs in folder
npx tsx processFiles.ts input_pdfs/

# Process with evaluation report
npx tsx processFiles.ts input_pdfs/ --eval

# Process PDF from URL
npx tsx processUrl.ts "https://slicedinvoices.com/pdf/wordpress-pdf-invoice-plugin-sample.pdf"
```

## 📈 Supported Document Types

- **📑 Invoices**: Client, amount, invoice number, due date
- **📋 Contracts**: Client name, dates, payment terms
- **🧾 Receipts**: Date, customer, amount, description

## 🚀 Batch Processing Features

- **Process multiple PDFs**: Handle entire folders at once
- **100% Success rate**: Reliable extraction across document types
- **Auto-classification**: Automatically detects invoices, contracts, receipts
- **Progress tracking**: Real-time status updates for each file
- **Centralized database**: Single JSON file with all extracted data
- **Fast processing**: Optimized for batch operations

### Example Batch Results
```bash
📊 Batch Processing Summary:
═══════════════════════════════════════
📁 Total files: 6
✅ Successful: 6
❌ Errors: 0
⏱️  Duration: 5.3s
📈 Success rate: 100.0%
📊 Database totals: 2 invoices, 2 contracts, 2 receipts
💾 JSON database: outputs\documents_database.json
═══════════════════════════════════════
```

## 🔧 Configuration

### Environment Variables (.env)
```env
GROQ_API_KEY=your_groq_api_key_here
```

### AI Model
- **Model**: llama3-70b-8192 (fast, reliable)
- **Provider**: Groq

---

**Made with [Mastra](https://mastra.ai) - The AI Engineering Framework** 🚀
