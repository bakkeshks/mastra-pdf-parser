import * as fs from 'fs';
import * as path from 'path';

interface DocumentRecord {
  id: string;
  processedAt: string;
  fileName: string;
  filePath: string;
  documentType: 'invoice' | 'contract' | 'receipt';
  extractedData: any;
  metadata: {
    extractedFields: number;
    processingDuration?: number;
    version: string;
  };
}

interface DocumentDatabase {
  version: string;
  createdAt: string;
  lastUpdated: string;
  totalDocuments: number;
  documents: DocumentRecord[];
  statistics: {
    invoices: number;
    contracts: number;
    receipts: number;
  };
}

// Go to project root (up from .mastra/output if in dev mode)
const projectRoot = process.cwd().includes('.mastra') 
  ? path.resolve(process.cwd(), '../../') 
  : process.cwd();
const DATABASE_PATH = path.join(projectRoot, 'outputs', 'documents_database.json');

// Generate unique ID for each document
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Ensure outputs directory exists
function ensureOutputsDirectory() {
  const outputsDir = path.dirname(DATABASE_PATH);
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }
}

// Load existing database or create new one
function loadDatabase(): DocumentDatabase {
  ensureOutputsDirectory();
  
  if (fs.existsSync(DATABASE_PATH)) {
    try {
      const content = fs.readFileSync(DATABASE_PATH, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('Warning: Could not load existing database, creating new one');
    }
  }
  
  // Create new database
  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalDocuments: 0,
    documents: [],
    statistics: {
      invoices: 0,
      contracts: 0,
      receipts: 0
    }
  };
}

// Save database to file
function saveDatabase(database: DocumentDatabase): void {
  ensureOutputsDirectory();
  fs.writeFileSync(DATABASE_PATH, JSON.stringify(database, null, 2));
}

// Add record to JSON database
export function addToJSONDatabase(
  extractedData: any, 
  filePath: string, 
  documentType: 'invoice' | 'contract' | 'receipt',
  extractedFields: number
): string {
  const database = loadDatabase();
  
  const record: DocumentRecord = {
    id: generateId(),
    processedAt: new Date().toISOString(),
    fileName: path.basename(filePath),
    filePath,
    documentType,
    extractedData,
    metadata: {
      extractedFields,
      version: '1.0.0'
    }
  };
  
  // Add record to database
  database.documents.push(record);
  database.totalDocuments = database.documents.length;
  database.lastUpdated = new Date().toISOString();
  
  // Update statistics
  switch (documentType) {
    case 'invoice':
      database.statistics.invoices++;
      break;
    case 'contract':
      database.statistics.contracts++;
      break;
    case 'receipt':
      database.statistics.receipts++;
      break;
  }
  
  // Save database
  saveDatabase(database);
  
  return DATABASE_PATH;
}

// Get database statistics
export function getDatabaseStats() {
  const database = loadDatabase();
  return {
    ...database.statistics,
    total: database.totalDocuments
  };
}

// Get recent documents
export function getRecentDocuments(limit: number = 10): DocumentRecord[] {
  const database = loadDatabase();
  return database.documents
    .sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime())
    .slice(0, limit);
}

// Search documents by type
export function searchDocuments(documentType?: 'invoice' | 'contract' | 'receipt', limit?: number): DocumentRecord[] {
  const database = loadDatabase();
  let results = database.documents;
  
  if (documentType) {
    results = results.filter(doc => doc.documentType === documentType);
  }
  
  if (limit) {
    results = results.slice(0, limit);
  }
  
  return results.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime());
}

// Export database path for external access
export const JSON_DATABASE_PATH = DATABASE_PATH;
