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

### Method 1: Mastra Playground (Web UI)
1. **Start the playground**: `npx mastra dev`
2. **Open**: http://localhost:4111/agents
3. **Test URL**: https://slicedinvoices.com/pdf/wordpress-pdf-invoice-plugin-sample.pdf
4. **⚠️ Important**: Use URLs only - local file upload won't work

### Method 2: CLI Processing (Recommended for Production)

#### Single File Processing
```bash
# Process a single PDF file
npx tsx processFiles.ts input_pdfs/your-invoice.pdf

# Process with evaluation report
npx tsx processFiles.ts input_pdfs/your-invoice.pdf --eval

# Process PDF from URL
npx tsx processUrl.ts "https://slicedinvoices.com/pdf/wordpress-pdf-invoice-plugin-sample.pdf"
```

#### Batch Processing
```bash
# Process all PDF files in folder
npx tsx processFiles.ts input_pdfs/

# Process with evaluation report
npx tsx processFiles.ts input_pdfs/ --eval

# Run evaluation on all processed documents
npx tsx evaluate.ts
```

#### Available CLI Options
- `-h, --help`: Show help message
- `-e, --eval`: Show detailed evaluation report  
- `-d, --debug`: Enable debug logging

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
npx tsx evaluate.ts
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

## 📈 Supported Document Types

- **📑 Invoices**: Client, amount, invoice number, due date
- **📋 Contracts**: Client name, dates, payment terms
- **🧾 Receipts**: Date, customer, amount, description

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
