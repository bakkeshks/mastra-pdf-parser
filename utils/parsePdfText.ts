import fs from 'fs';
import PDFParser from 'pdf2json';

export async function extractTextFromPdf(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(`PDF parsing error: ${errData.parserError}`));
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        // Extract text from all pages
        let extractedText = '';
        
        if (pdfData.Pages) {
          for (const page of pdfData.Pages) {
            if (page.Texts) {
              for (const textItem of page.Texts) {
                if (textItem.R) {
                  for (const textRun of textItem.R) {
                    if (textRun.T) {
                      // Decode URI component and add space
                      extractedText += decodeURIComponent(textRun.T) + ' ';
                    }
                  }
                }
              }
              extractedText += '\n'; // Add line break between pages
            }
          }
        }
        
        // Clean up the text
        const cleanedText = extractedText
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/\n\s*\n/g, '\n') // Remove empty lines
          .trim();
        
        if (!cleanedText) {
          reject(new Error('No text could be extracted from the PDF'));
          return;
        }
        
        resolve(cleanedText);
      } catch (error) {
        reject(new Error(`Text extraction error: ${error}`));
      }
    });
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      reject(new Error(`File not found: ${filePath}`));
      return;
    }
    
    // Load and parse the PDF
    pdfParser.loadPDF(filePath);
  });
}

export function validatePdfFile(filePath: string): boolean {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  // Check if file has .pdf extension
  if (!filePath.toLowerCase().endsWith('.pdf')) {
    return false;
  }
  
  // Check if file is readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
