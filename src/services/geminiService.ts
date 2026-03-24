import { GoogleGenAI, Type, ThinkingLevel, FunctionDeclaration } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please add it to your environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

console.log('GEMINI_API_KEY is defined:', !!process.env.GEMINI_API_KEY);

const pubmedFunctionDeclaration: FunctionDeclaration = {
  name: "searchPubMed",
  parameters: {
    type: Type.OBJECT,
    description: "Search PubMed for clinical articles from the last 5 years (2021-2026) and returns titles, authors, source, publication date, DOI, and URLs.",
    properties: {
      query: {
        type: Type.STRING,
        description: "The search query for PubMed.",
      },
    },
    required: ["query"],
  },
};

async function searchPubMed(query: string) {
  try {
    const response = await fetch('/api/pubmed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    
    if (data.error) {
      console.error('PubMed API error:', data.error);
      return `Error searching PubMed: ${data.error}`;
    }
    
    if (!data.results || data.results.length === 0) return "No results found on PubMed.";
    
    return JSON.stringify(data.results);
  } catch (error) {
    console.error('Error searching PubMed:', error);
    return "Error searching PubMed.";
  }
}

const callGeminiWithRetry = async (params: any, retries = 3, backoff = 1000): Promise<any> => {
  try {
    console.log(`Calling Gemini (${params.model})...`);
    const ai = getAI();
    const result = await ai.models.generateContent(params);
    return result;
  } catch (error: any) {
    console.error(`Gemini API Error (${params.model}):`, error.message || error);
    if (retries > 0 && (error.message?.includes('429') || error.message?.includes('Too Many Requests') || error.message?.includes('500') || error.message?.includes('503'))) {
      console.log(`Retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callGeminiWithRetry(params, retries - 1, backoff * 2);
    }
    throw error;
  }
};

export const extractDocumentKnowledge = async (type: 'protocol' | 'leaflet', file?: File, text?: string) => {
  const promptText = `
Actúa como un motor de lectura clínica, extracción de conocimiento y normalización documental para una aplicación odontológica llamada Novik.

Tu trabajo es analizar el documento proporcionado y convertirlo en conocimiento clínico estructurado, utilizable y priorizable por el motor de decisión clínica.

Devuelve la información en formato JSON con la siguiente estructura:
{
  "summary": "Resumen clínico útil",
  "actionableData": {
    "indications": ["..."],
    "contraindications": ["..."],
    "posology": ["..."],
    "maxDoses": ["..."],
    "interactions": ["..."],
    "warnings": ["..."],
    "specialSituations": ["..."]
  },
  "rules": ["Regla 1", "Regla 2"],
  "dentalRelevance": "Por qué es relevante para odontología",
  "limitations": ["Limitación 1"],
  "importantFragments": ["Fragmento 1"]
}
  `;

  const parts: any[] = [{ text: promptText }];

  if (file) {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    parts.push({
      inlineData: {
        data: base64Data,
        mimeType: file.type || 'application/pdf',
      },
    });
  } else if (text) {
    parts.push({ text: `Documento:\n${text}` });
  } else {
    throw new Error("Debe proporcionar un archivo o texto.");
  }

  try {
    const response = await callGeminiWithRetry({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts }],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            actionableData: {
              type: Type.OBJECT,
              properties: {
                indications: { type: Type.ARRAY, items: { type: Type.STRING } },
                contraindications: { type: Type.ARRAY, items: { type: Type.STRING } },
                posology: { type: Type.ARRAY, items: { type: Type.STRING } },
                maxDoses: { type: Type.ARRAY, items: { type: Type.STRING } },
                interactions: { type: Type.ARRAY, items: { type: Type.STRING } },
                warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
                specialSituations: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            rules: { type: Type.ARRAY, items: { type: Type.STRING } },
            dentalRelevance: { type: Type.STRING },
            limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
            importantFragments: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["summary", "actionableData", "rules", "dentalRelevance", "limitations", "importantFragments"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Error extracting knowledge:', error);
    throw error;
  }
};

export const anonymizeAndExtractClinicalData = async (file: File) => {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const promptText = `
Actúa como un sistema de anonimización y extracción de datos médicos de alta seguridad.
Tu tarea es leer el documento adjunto (que puede ser una analítica, ECG, informe médico, etc.) y extraer TODA la información clínica relevante.

REGLA CRÍTICA DE SEGURIDAD: DEBES ELIMINAR CUALQUIER DATO DE CARÁCTER PERSONAL (PII).
- Elimina nombres y apellidos del paciente.
- Elimina números de identificación (DNI, pasaporte, número de historia clínica).
- Elimina direcciones, teléfonos y correos electrónicos.
- Elimina fechas exactas de nacimiento (puedes mantener la edad si aparece).
- Elimina nombres de médicos o personal sanitario.

Devuelve ÚNICAMENTE el texto clínico extraído y estructurado, listo para ser evaluado por un médico. No incluyas saludos ni explicaciones, solo los datos médicos anonimizados.
  `;

  try {
    console.log('Anonymizing document with Gemini Flash...');
    const response = await callGeminiWithRetry({
      model: 'gemini-3-flash-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: promptText },
          { inlineData: { data: base64Data, mimeType: file.type || 'application/pdf' } }
        ]
      }],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });
    console.log('Anonymization successful.');
    return response.text;
  } catch (error) {
    console.error('Error anonymizing document:', error);
    throw error;
  }
};

// Helper to re-index citations and format them as superscripts with commas
function processCitationsAndReferences(text: string, language: string): string {
  // 0. Pre-process: Merge adjacent citations like [1][2], [1] [2], [1], [2] into [1, 2]
  // This ensures they are wrapped in a single <sup> tag later
  let processedText = text.replace(/\]\s*[,;]?\s*\[/g, ', ');

  const refSectionRegex = /###\s+(?:References|Referencias bibliográficas|Bibliografía|Fuentes|BIBLIOGRAFÍA)/i;
  const parts = processedText.split(refSectionRegex);
  
  if (parts.length < 2) {
    // Fallback: just format existing citations as superscripts
    return processedText.replace(/\[([\d,\s]+)\]/g, (match, p1) => {
      const nums = p1.split(',').map(n => n.trim()).filter(n => n !== '');
      const links = nums.map(n => `[${n}](#ref-${n})`).join(', ');
      return `<sup>${links}</sup>`;
    });
  }

  let mainText = parts[0];
  const refsText = parts.slice(1).join('### References');

  // 1. Find all citations in main text in order of appearance
  const citationRegex = /\[([\d,\s]+)\]/g;
  const citationsInOrder: number[] = [];
  let match;
  while ((match = citationRegex.exec(mainText)) !== null) {
    const nums = match[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    nums.forEach(n => {
      if (!citationsInOrder.includes(n)) {
        citationsInOrder.push(n);
      }
    });
  }

  // 2. Map old indices to new sequential indices (1, 2, 3...)
  const indexMap = new Map<number, number>();
  citationsInOrder.forEach((oldIdx, i) => {
    indexMap.set(oldIdx, i + 1);
  });

  // 3. Replace citations in main text with new indices and format as <sup>[1](#ref-1), [2](#ref-2)</sup>
  mainText = mainText.replace(/\[([\d,\s]+)\]/g, (match, p1) => {
    const nums = p1.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    if (nums.length === 0) return match;
    
    const links = nums.map(oldIdx => {
      const newIdx = indexMap.get(oldIdx) || oldIdx;
      return `[${newIdx}](#ref-${newIdx})`;
    });
    return `<sup>${links.join(', ')}</sup>`;
  });

  // 4. Rebuild references list with new indices and in the order they appear
  const refLines = refsText.split('\n');
  const refContentMap = new Map<number, string>();
  let currentRefIdx = -1;
  refLines.forEach(line => {
    const m = line.match(/^\[?(\d+)\]?[\.\)\-]?\s+(.*)/);
    if (m) {
      currentRefIdx = parseInt(m[1]);
      refContentMap.set(currentRefIdx, m[2]);
    } else if (currentRefIdx !== -1 && line.trim() !== '') {
      refContentMap.set(currentRefIdx, refContentMap.get(currentRefIdx) + ' ' + line.trim());
    }
  });

  const newRefs: string[] = [];
  citationsInOrder.forEach((oldIdx, i) => {
    let content = refContentMap.get(oldIdx);
    if (content) {
      // Fallback: If the AI failed to format as a markdown link, auto-link PMID, DOI, or URL
      if (!content.includes('](') && !content.includes('<a ')) {
        const pmidMatch = content.match(/(?:PMID|PubMed):\s*(\d+)/i);
        if (pmidMatch) {
          content = content.replace(pmidMatch[0], `PMID: [${pmidMatch[1]}](https://pubmed.ncbi.nlm.nih.gov/${pmidMatch[1]}/)`);
        } else {
          const doiMatch = content.match(/DOI:\s*(10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+)/i);
          if (doiMatch) {
            content = content.replace(doiMatch[0], `DOI: [${doiMatch[1]}](https://doi.org/${doiMatch[1]})`);
          } else {
            const urlMatch = content.match(/(https?:\/\/[^\s]+)/i);
            if (urlMatch) {
              content = content.replace(urlMatch[0], `[${urlMatch[0]}](${urlMatch[0]})`);
            }
          }
        }
      } else {
        // Fix broken markdown links like [Title](DOI: 10...) or [Title](10...)
        content = content.replace(/\]\((?:DOI:\s*)?(10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+)\)/gi, '](https://doi.org/$1)');
        // Fix broken markdown links like [Title](PMID: 12345) or [Title](PubMed: 12345)
        content = content.replace(/\]\((?:PMID|PubMed):\s*(\d+)\)/gi, '](https://pubmed.ncbi.nlm.nih.gov/$1/)');
      }
      
      const newIdx = i + 1;
      newRefs.push(`${newIdx}. <span id="ref-${newIdx}" class="scroll-mt-24 inline-block"></span>${content}`);
    }
  });

  const header = language === 'en' ? 'References' : 'Referencias bibliográficas';
  return `${mainText.trim()}\n\n### ${header}\n${newRefs.join('\n')}`;
}

export const askFollowUpQuestion = async (
  patientData: any,
  initialRecommendation: string,
  chatHistory: { role: string; content: string }[],
  newQuestion: string,
  language: string = 'es',
  onProgress?: (status: string) => void
) => {
  // The last message in chatHistory is the newQuestion, so we take everything before it
  const previousHistory = chatHistory.slice(0, -1);
  const historyText = previousHistory.map(msg => `${msg.role === 'user' ? 'Odontólogo' : 'Novik'}: ${msg.content}`).join('\n\n');
  
  const prompt = `
Actúa como un asistente clínico especializado en odontología médica.
Acabas de proporcionar una recomendación clínica para un paciente y el odontólogo tiene una duda adicional.

## DATOS DEL PACIENTE
- Edad: ${patientData.age}
- Peso: ${patientData.weight} ${patientData.weightUnit || 'kg'}
- Sexo: ${patientData.sex}
- Procedimiento: ${patientData.procedure}
- Patologías: ${patientData.currentPathologies || 'Ninguna'}
- Medicación habitual: ${patientData.medication || 'Ninguna'}
- Alergias: ${patientData.allergies || 'Ninguna'}
- Documentos adjuntos: ${patientData.attachedDocumentsText || 'Ninguno'}

## RECOMENDACIÓN INICIAL DADA
${initialRecommendation}

## HISTORIAL DE PREGUNTAS
${historyText}

## NUEVA PREGUNTA DEL ODONTÓLOGO
${newQuestion}

Responde a la duda del odontólogo de forma directa, concisa, profesional y basada en la evidencia clínica y la seguridad del paciente.
CRITICAL INSTRUCTIONS: 
1. PATIENT CONTEXT IS ABSOLUTE: You MUST strictly evaluate the new question in the context of the PATIENT DATA provided above. DO NOT give generic answers. If the user asks about a drug, you MUST calculate the maximum dose based on their weight (${patientData.weight} ${patientData.weightUnit || 'kg'}) and adjust it based on their specific pathologies and medication.
2. LANGUAGE: You MUST generate your response in the SAME LANGUAGE that the user used in their new question.
3. DRUGBANK LINKS: Every time you mention a drug name, you MUST format it as a Markdown link to its DrugBank entry.
4. PUBMED REFERENCES: You MUST search PubMed for recent articles (last 5 years, 2021-2026) to corroborate your recommendations. Cite these sources using sequential numbers in brackets (e.g., [1], [2]) starting from [1] in the order they appear. CRITICAL: In the references list at the end, EVERY SINGLE REFERENCE MUST have its title formatted as a Markdown link pointing EXACTLY to the url provided by the searchPubMed tool (e.g., [Title](https://pubmed.ncbi.nlm.nih.gov/123456/)). DO NOT invent PMIDs. DO NOT leave any reference without a link.
5. SEQUENTIAL CITATIONS: Your citations MUST be sequentially numbered [1], [2], [3]... in the order they appear in your text. If you cite multiple sources for the same statement, use [1, 2] or [1, 2, 3]. DO NOT use [1][2].
6. FORMAT: Use a professional, clinical tone. Be direct and concise.
7. RECENT EVIDENCE: Prioritize evidence from the last 5 years (2021-2026).
8. ALWAYS PROVIDE TEXT: Even if you use tools, you MUST provide a final text response answering the question.
  `;

  try {
    let response;
    let contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
    let iterations = 0;
    const maxIterations = 3;
    
    while (iterations < maxIterations) {
      if (onProgress) onProgress(language === 'en' ? 'Thinking...' : 'Pensando...');
      
      console.log(`Follow-up iteration ${iterations + 1}...`);
      response = await callGeminiWithRetry({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: { 
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ functionDeclarations: [pubmedFunctionDeclaration] }]
        }
      });

      const functionCalls = response.functionCalls;
      
      // If no function calls, we might have the final text
      if (!functionCalls || functionCalls.length === 0) {
        console.log('No function calls in follow-up response.');
        break;
      }

      console.log('Follow-up Gemini requested function calls:', functionCalls);
      const functionResponses = [];
      for (const fc of functionCalls) {
        if (fc.name === 'searchPubMed') {
          try {
            if (onProgress) onProgress(language === 'en' ? 'Searching PubMed...' : 'Buscando en PubMed...');
            const result = await searchPubMed(fc.args.query);
            functionResponses.push({
              functionResponse: {
                name: fc.name,
                response: { content: result }
              }
            });
          } catch (toolError) {
            console.error('Error executing searchPubMed tool in follow-up:', toolError);
            functionResponses.push({
              functionResponse: {
                name: fc.name,
                response: { content: "Error searching PubMed." }
              }
            });
          }
        }
      }

      if (functionResponses.length === 0) break;
      
      if (response.candidates?.[0]?.content) {
        contents.push(response.candidates[0].content);
        contents.push({ role: 'user', parts: functionResponses });
      } else {
        break;
      }
      iterations++;
    }
    
    // Final check: if the last response has no text but has function calls, or if we just want to be sure
    let finalText = '';
    try {
      finalText = response?.text || '';
    } catch (e) {
      finalText = response?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
    }

    if (!finalText && response?.functionCalls && response.functionCalls.length > 0) {
      console.log('Finalizing follow-up with a text-only call...');
      if (onProgress) onProgress(language === 'en' ? 'Finalizing answer...' : 'Finalizando respuesta...');
      
      const finalResponse = await callGeminiWithRetry({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: {} // No tools here to force text
      });
      
      try {
        finalText = finalResponse.text || '';
      } catch (e) {
        finalText = finalResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
      }
    }

    if (!finalText) {
      console.error('Follow-up final text is empty. Full response:', JSON.stringify(response));
      // One last desperate attempt with a very simple prompt if everything else failed
      try {
        console.log('Desperate fallback for follow-up...');
        const fallbackResponse = await callGeminiWithRetry({
          model: 'gemini-3.1-pro-preview',
          contents: [{ role: 'user', parts: [{ text: `Responde a esta pregunta del odontólogo basándote en la recomendación previa: ${newQuestion}` }] }]
        });
        finalText = fallbackResponse.text || fallbackResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }

    if (!finalText) {
      return language === 'en' ? 'I am sorry, I could not generate a response at this time.' : 'Lo siento, no he podido generar una respuesta en este momento.';
    }

    // Process citations and references in the follow-up response
    return processCitationsAndReferences(finalText, language);
  } catch (error) {
    console.error('Error answering follow-up:', error);
    throw error;
  }
};

export const evaluateClinicalCase = async (
  patientData: any,
  activeProtocols: any[],
  activeLeaflets: any[],
  language: string = 'es',
  onProgress?: (status: string) => void
) => {
  const protocolsContext = activeProtocols.map(p => `${p.content}`).join('\n\n');
  const leafletsContext = activeLeaflets.map(l => `PROSPECTO: ${l.commercialName} (${l.activeIngredient})\n${l.content}`).join('\n\n');

  const basePrompt = language === 'en' ? `
Act as a clinical assistant specialized in medical dentistry, dental pharmacology, and preoperative medical risk assessment. Your role is to help the dentist make safer, more prudent, and justified decisions, never to replace their clinical judgment.

Your absolute priority is patient safety.
You must always reason in a structured, prudent, and explicit way before issuing recommendations.

## PATIENT DATA
- Age: ${patientData.age}
- Weight: ${patientData.weight} ${patientData.weightUnit || 'kg'}
- Height: ${patientData.height ? `${patientData.height} ${patientData.heightUnit || 'cm'}` : 'Not specified'}
- Sex: ${patientData.sex}
- Planned procedure: ${patientData.procedure}
- Medical history: ${patientData.medicalHistory || 'None'}
- Current pathologies: ${patientData.currentPathologies || 'None'}
- Usual medication: ${patientData.medication || 'None'}
- Drug allergies: ${patientData.allergies || 'None'}
- Attached clinical documents (anonymized): ${patientData.attachedDocumentsText || 'None'}

## ACTIVE DOCUMENTARY BASE (Priority 1 and 2)
### REFERENCE CLINICAL KNOWLEDGE:
${protocolsContext || 'No additional clinical knowledge active.'}

### PHARMACOLOGICAL LEAFLETS:
${leafletsContext || 'No active leaflets.'}

## RULES OF ACTION
1. Never invent clinical data.
2. If important data is missing, say so clearly.
3. Prioritize clinical safety.
4. Be conservative in patients with multiple pathologies, polypharmacy, or high medical risk.
5. Every recommendation must be justified by patient data and the documentary base.
6. Hierarchy of sources: 1. Reference clinical knowledge, 2. Provided leaflets, 3. PubMed (MANDATORY: You MUST use the 'searchPubMed' tool to find recent evidence from the last 5 years, 2021-2026, for every case), 4. General knowledge.
7. If the patient is allergic to amoxicillin or penicillins, DO NOT propose cephalosporins.
8. DO NOT explicitly mention the word "protocol" or the title of the provided documents. Integrate the information as your own clinical knowledge and only cite the real medical references (authors, years) found in them.
9. DO NOT INCLUDE LEAFLETS IN THE BIBLIOGRAPHY: If you use information from the provided leaflets, DO NOT include them in the "References" section. This section must contain only scientific medical literature (articles, guides, books). Information from leaflets is integrated into the text without the need for a numbered citation or simply citing it as "(Leaflet)".
10. PUBMED USAGE: You MUST perform at least one PubMed search for every clinical case to ensure the latest evidence (last 5 years, 2021-2026) is considered.

CRITICAL INSTRUCTIONS: 
1. LANGUAGE: You MUST generate your response content in English. This applies to all sections and the bibliography.
2. CONCISENESS & FORMAT: Your response MUST be EXTREMELY concise, practical, and schematic. ZERO filler text. DO NOT mention negative findings (e.g., do not say "No interactions"). ONLY mention relevant, existing interactions for the EXACT drugs you are proposing. DO NOT advise against drugs you haven't proposed.
3. DRUGBANK LINKS: Every time you mention a drug name, you MUST format it as a Markdown link to its DrugBank search page. Use EXACTLY this format: [DrugName](https://go.drugbank.com/search?query=drug+name). Replace spaces with '+' and remove all accents/diacritics in the URL query. Example: [Mefenamic acid](https://go.drugbank.com/search?query=mefenamic+acid). This is CRITICAL for the user to verify drug details.
4. CITATIONS: You MUST be EXHAUSTIVE with your citations. Cite EVERY clinical recommendation, drug choice, dosage adjustment, and contraindication using numbers in brackets (e.g., [1], [2]). A complex case should have at least 10-15 citations. DO NOT use Author-Year format. Ensure citations are placed IMMEDIATELY after the statement they support, before any punctuation. If you cite multiple sources, use [1, 2] or [1, 2, 3]. DO NOT use [1][2].
5. DOSE ADJUSTMENT: You MUST strictly calculate and adjust all anesthetic and pharmacological doses according to the patient's specific age (${patientData.age} years), weight (${patientData.weight} ${patientData.weightUnit || 'kg'}), and clinical conditions. Explicitly state the calculated maximum doses and recommended posology based on these parameters.
6. TABLES: Whenever you propose drugs (Anesthetics, Antibiotics, Analgesics, Anti-inflammatories), you MUST use Markdown tables with the following columns: 'Drug', 'Theoretical Max Dose', 'Recommended Clinical Limit (Adjusted)', 'Justification', 'Interactions'. The 'Recommended Clinical Limit (Adjusted)' MUST be calculated based on the patient's specific age, weight, pathologies, and medication.
7. INTERACTIONS: In the tables, if a proposed drug has NO interactions with the patient's current medication, leave the cell EMPTY or write "-". NEVER write "No interactions found". NEVER mention interactions for drugs you are not proposing.
8. PUBMED SEARCH: Use the 'searchPubMed' tool to find recent articles (last 5 years) that support your recommendations.
` : `
Actúa como un asistente clínico especializado en odontología médica, farmacología odontológica y valoración de riesgo médico preoperatorio. Tu función es ayudar al odontólogo a tomar decisiones más seguras, prudentes y justificadas, nunca sustituir su criterio clínico.

Tu prioridad absoluta es la seguridad del paciente.
Debes razonar siempre de forma estructurada, prudente y explícita antes de emitir recomendaciones.

## DATOS DEL PACIENTE
- Edad: ${patientData.age}
- Peso: ${patientData.weight} ${patientData.weightUnit || 'kg'}
- Altura: ${patientData.height ? `${patientData.height} ${patientData.heightUnit || 'cm'}` : 'No especificada'}
- Sexo: ${patientData.sex}
- Procedimiento previsto: ${patientData.procedure}
- Antecedentes médicos: ${patientData.medicalHistory || 'Ninguno'}
- Patologías actuales: ${patientData.currentPathologies || 'Ninguna'}
- Medicación habitual: ${patientData.medication || 'Ninguna'}
- Alergias medicamentosas: ${patientData.allergies || 'Ninguna'}
- Documentos clínicos adjuntos (anonimizados): ${patientData.attachedDocumentsText || 'Ninguno'}

## BASE DOCUMENTAL ACTIVA (Prioridad 1 y 2)
### CONOCIMIENTO CLÍNICO DE REFERENCIA:
${protocolsContext || 'No hay conocimiento clínico adicional activo.'}

### PROSPECTOS FARMACOLÓGICOS:
${leafletsContext || 'No hay prospectos activos.'}

## REGLAS DE ACTUACIÓN
1. Nunca inventes datos clínicos.
2. Si faltan datos importantes, dilo claramente.
3. Prioriza la seguridad clínica.
4. Sé conservador en pacientes con pluripatología, polimedicación o riesgo médico elevado.
5. Toda recomendación debe estar justificada por los datos del paciente y la base documental.
6. Jerarquía de fuentes: 1. Conocimiento clínico de referencia, 2. Prospectos facilitados, 3. PubMed (MANDATORY: You MUST use the 'searchPubMed' tool to find recent evidence from the last 5 years, 2021-2026, for every case), 4. Conocimiento general.
7. Si el paciente es alérgico a amoxicilina o penicilinas, NO propongas cefalosporinas.
8. NO menciones explícitamente la palabra "protocolo" ni el título de los documentos facilitados. Integra la información como tu propio conocimiento clínico y cita únicamente las referencias médicas reales (autores, años) que se encuentren en ellos.
9. NO INCLUYAS PROSPECTOS EN LA BIBLIOGRAFÍA: Si utilizas información de los prospectos facilitados, NO los incluyas en la sección de "Referencias bibliográficas". Esta sección debe contener únicamente literatura médica científica (artículos, guías, libros). La información de los prospectos se integra en el texto sin necesidad de cita numerada o citándola simplemente como "(Prospecto)".
10. PUBMED USAGE: You MUST perform at least one PubMed search for every clinical case to ensure the latest evidence (last 5 years, 2021-2026) is considered.

CRITICAL INSTRUCTIONS: 
1. LANGUAGE: You MUST generate your response content in Spanish. This applies to all sections and the bibliography.
2. CONCISENESS & FORMAT: Your response MUST be EXTREMELY concise, practical, and schematic. ZERO filler text. DO NOT mention negative findings (e.g., do not say "No hay interacciones"). ONLY mention relevant, existing interactions for the EXACT drugs you are proposing. DO NOT advise against drugs you haven't proposed.
3. DRUGBANK LINKS: Every time you mention a drug name, you MUST format it as a Markdown link to its DrugBank search page. Use EXACTLY this format: [DrugName](https://go.drugbank.com/search?query=drug+name). Replace spaces with '+' and remove all accents/diacritics in the URL query. Example: [Ácido mefenámico](https://go.drugbank.com/search?query=acido+mefenamico). This is CRITICAL for the user to verify drug details.
4. CITATIONS: You MUST be EXHAUSTIVE with your citations. Cite EVERY clinical recommendation, drug choice, dosage adjustment, and contraindication using numbers in brackets (e.g., [1], [2]). A complex case should have at least 10-15 citations. DO NOT use Author-Year format. Ensure citations are placed IMMEDIATELY after the statement they support, before any punctuation. If you cite multiple sources, use [1, 2] or [1, 2, 3]. DO NOT use [1][2].
5. DOSE ADJUSTMENT: You MUST strictly calculate and adjust all anesthetic and pharmacological doses according to the patient's specific age (${patientData.age} years), weight (${patientData.weight} ${patientData.weightUnit || 'kg'}), and clinical conditions. Explicitly state the calculated maximum doses and recommended posology based on these parameters.
6. TABLAS: Siempre que propongas fármacos (Anestésicos, Antibióticos, Analgésicos, Antiinflamatorios), DEBES usar tablas Markdown con las siguientes columnas: 'Fármaco', 'Dosis Máxima Teórica', 'Límite Clínico Recomendado (Ajustado)', 'Justificación', 'Interacciones'. El 'Límite Clínico Recomendado (Ajustado)' DEBE calcularse de forma conservadora basándose en la edad, peso, patologías y medicación específica del paciente.
7. INTERACTIONS: In the tables, if a proposed drug has NO interactions with the patient's current medication, leave the cell EMPTY or write "-". NEVER write "No presenta interacciones". NEVER mention interactions for drugs you are not proposing.
8. PUBMED SEARCH: Use the 'searchPubMed' tool to find recent articles (last 5 years) that support your recommendations.
`;

  try {
    if (onProgress) onProgress(language === 'en' ? 'Analyzing clinical case...' : 'Analizando caso clínico...');

    const prompt = basePrompt + `

**TAREA ESPECÍFICA:**
Genera un informe clínico completo y estructurado con las siguientes secciones EXACTAS (usa estos encabezados):

### ${language === 'en' ? 'Preoperative Precautions' : 'Precauciones preoperatorias'}
Analiza el riesgo médico general antes de la intervención. DEBES INCLUIR AQUÍ la necesidad de profilaxis antibiótica y su pauta ÚNICAMENTE si está estrictamente indicada (si no está indicada, NO la menciones en absoluto). NO incluyas interacciones farmacológicas aquí. NO incluyas manejo de anestésicos aquí. Sé extremadamente esquemático (usa viñetas cortas).

### ${language === 'en' ? 'Anesthetics' : 'Anestésicos'}
Propón EXACTAMENTE 3 opciones de anestesia local en orden de preferencia. PRESENTA ESTAS 3 OPCIONES EN UNA TABLA MARKDOWN con las columnas: Opción (1ª, 2ª, 3ª), Anestésico y Vasoconstrictor, Dosis Máxima, Justificación, Interacciones. REGLA CRÍTICA: En la columna "Interacciones", SOLO escribe algo si existe una interacción real con la medicación actual del paciente. Si no hay interacción, escribe "-". NO hables de fármacos que no estás proponiendo en la tabla.

### ${language === 'en' ? 'Antibiotics' : 'Antibióticos'}
Propón EXACTAMENTE 3 opciones de tratamiento antibiótico POSTOPERATORIO (si hay infección) en orden de preferencia. PRESENTA ESTAS 3 OPCIONES EN UNA TABLA MARKDOWN con las columnas: Opción (1ª, 2ª, 3ª), Antibiótico, Pauta, Justificación, Interacciones. REGLA CRÍTICA: NO hables de profilaxis aquí. En la columna "Interacciones", SOLO escribe algo si existe una interacción real con la medicación actual del paciente. Si no hay interacción, escribe "-". NO hables de fármacos que no estás proponiendo en la tabla.

### ${language === 'en' ? 'Analgesics and Anti-inflammatories' : 'Analgésicos y antiinflamatorios'}
Propón EXACTAMENTE 3 opciones de analgésicos y EXACTAMENTE 3 opciones de antiinflamatorios en orden de preferencia. PRESENTA ESTAS OPCIONES EN DOS TABLAS MARKDOWN SEPARADAS (una para Analgésicos, otra para Antiinflamatorios) con las columnas: Opción (1ª, 2ª, 3ª), Fármaco, Pauta, Justificación, Interacciones. REGLA CRÍTICA: En la columna "Interacciones", SOLO escribe algo si existe una interacción real con la medicación actual del paciente. Si no hay interacción, escribe "-". NO hables de fármacos que no estás proponiendo en las tablas.

### ${language === 'en' ? 'Postoperative Precautions and Suggestions' : 'Precauciones y sugerencias postoperatorias'}
Enumera los cuidados tras el procedimiento y signos de alarma. Sé extremadamente esquemático (usa viñetas cortas).

### ${language === 'en' ? 'References' : 'Referencias bibliográficas'}
Genera una lista bibliográfica EXHAUSTIVA en formato Vancouver para TODAS las citas médicas que hayas incluido en el texto anterior. 
Debes incluir una referencia real y verificable para CADA afirmación clínica, elección de fármaco, ajuste de dosis y contraindicación mencionada. Un caso complejo debe tener al menos 10-15 referencias.
Asegúrate de que las referencias correspondan exactamente al contexto médico del paciente (por ejemplo, no cites fuentes pediátricas si el paciente es adulto). PRIORIZA REFERENCIAS DE LOS ÚLTIMOS 5 AÑOS (2021-2026).
INCLUYE SIEMPRE EL ENLACE DIRECTO A PUBMED en cada referencia bibliográfica.
CRÍTICO Y OBLIGATORIO: TODAS Y CADA UNA de las referencias bibliográficas DEBEN tener el título del artículo formateado como un enlace Markdown que apunte EXACTAMENTE a la url proporcionada por la herramienta searchPubMed (ej: https://pubmed.ncbi.nlm.nih.gov/123456/). NO inventes PMIDs. NO dejes NINGUNA referencia sin su enlace.
Formato exacto de la lista:
1. Autor(es). [Título del artículo](https://pubmed.ncbi.nlm.nih.gov/123456/). Fuente. Año.
2. Autor(es). [Título del artículo](https://pubmed.ncbi.nlm.nih.gov/654321/). Fuente. Año.
`;

    const steps = language === 'en' 
      ? [
          'Analyzing patient data...', 
          'Evaluating medical risk...', 
          'Selecting anesthetics...', 
          'Checking interactions...', 
          'Formulating antibiotics...', 
          'Adjusting dosages...', 
          'Generating recommendations...',
          'Compiling references...',
          'Reviewing safety guidelines...',
          'Finalizing clinical report (this may take a minute)...'
        ]
      : [
          'Analizando datos del paciente...', 
          'Evaluando riesgo médico...', 
          'Seleccionando anestésicos...', 
          'Comprobando interacciones...', 
          'Formulando antibióticos...', 
          'Ajustando dosis...', 
          'Generando recomendaciones...',
          'Compilando referencias...',
          'Revisando guías de seguridad...',
          'Finalizando informe clínico (esto puede tomar un minuto)...'
        ];
    
    let stepIndex = 0;
    if (onProgress) onProgress(steps[0]);
    
    const progressInterval = setInterval(() => {
      stepIndex++;
      if (onProgress && stepIndex < steps.length) {
        onProgress(steps[stepIndex]);
      } else if (onProgress && stepIndex >= steps.length) {
        onProgress(language === 'en' ? 'Finalizing clinical report (this may take a minute)...' : 'Finalizando informe clínico (esto puede tomar un minuto)...');
      }
    }, 4000);

    let response;
    let contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
    
    try {
      console.log('Calling Gemini API with tools...');
      
      let iterations = 0;
      const maxIterations = 5;

      while (iterations < maxIterations) {
        console.log(`Iteration ${iterations + 1} of tool loop...`);
        try {
          response = await callGeminiWithRetry({
            model: 'gemini-3.1-pro-preview',
            contents,
            config: { 
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              tools: [{ functionDeclarations: [pubmedFunctionDeclaration] }]
            }
          });
          console.log('Gemini response received.');
        } catch (apiError: any) {
          console.error('Gemini API Error details:', apiError);
          throw apiError;
        }

        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) {
          console.log('No function calls requested by Gemini.');
          break;
        }

        console.log('Gemini requested function calls:', functionCalls);
        const functionResponses = [];
        for (const fc of functionCalls) {
          if (fc.name === 'searchPubMed') {
            try {
              if (onProgress) onProgress(language === 'en' ? 'Searching PubMed...' : 'Buscando en PubMed...');
              const result = await searchPubMed(fc.args.query);
              functionResponses.push({
                functionResponse: {
                  name: fc.name,
                  response: { content: result }
                }
              });
            } catch (toolError) {
              console.error('Error executing searchPubMed tool:', toolError);
              functionResponses.push({
                functionResponse: {
                  name: fc.name,
                  response: { content: "Error searching PubMed." }
                }
              });
            }
          }
        }

        if (functionResponses.length === 0) {
          console.log('No valid function responses generated.');
          break;
        }

        // Add model's turn and function responses to history
        if (response.candidates?.[0]?.content) {
          contents.push(response.candidates[0].content);
          contents.push({ role: 'user', parts: functionResponses });
        } else {
          console.error('No candidate content found in response.');
          break;
        }
        
        iterations++;
        if (onProgress) onProgress(language === 'en' ? 'Processing PubMed results...' : 'Procesando resultados de PubMed...');
      }
      
      console.log('Gemini API call sequence completed.');
    } finally {
      clearInterval(progressInterval);
    }

    if (onProgress) onProgress(language === 'en' ? 'Formatting report...' : 'Formateando informe...');
    
    let finalText = '';
    
    // Extract all text from model turns in the contents array
    const modelTexts = contents
      .filter(c => c.role === 'model')
      .map(c => {
        const textPart = c.parts?.find((p: any) => p.text);
        return textPart ? textPart.text : '';
      })
      .filter(t => t && t.trim().length > 0);

    // Also check the final response if it's not already in contents
    let lastResponseText = '';
    try {
      lastResponseText = response?.text || '';
    } catch (e) {
      lastResponseText = response?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
    }
    
    // If the last response text is not empty and not already the last item in modelTexts
    if (lastResponseText.trim().length > 0 && modelTexts[modelTexts.length - 1] !== lastResponseText) {
      modelTexts.push(lastResponseText);
    }

    finalText = modelTexts.join('\n\n');

    // If we have function calls but no text at all, do one last call to get the final text
    if (!finalText && response?.functionCalls && response.functionCalls.length > 0) {
      console.log('Finalizing report with a text-only call...');
      if (onProgress) onProgress(language === 'en' ? 'Finalizing report...' : 'Finalizando informe...');
      
      const finalResponse = await callGeminiWithRetry({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
      });
      
      try {
        finalText = finalResponse.text || '';
      } catch (e) {
        finalText = finalResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
      }
    }

    if (!finalText) {
      console.error('Final text is empty. Full response:', JSON.stringify(response));
      // Desperate fallback
      try {
        console.log('Desperate fallback for main analysis...');
        const fallbackResponse = await callGeminiWithRetry({
          model: 'gemini-3.1-pro-preview',
          contents: [{ role: 'user', parts: [{ text: language === 'en' ? `Generate the requested clinical report based on the data provided above.` : `Genera el informe clínico solicitado basándote en los datos proporcionados anteriormente.` }] }]
        });
        finalText = fallbackResponse.text || fallbackResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }

    if (!finalText) {
      throw new Error(language === 'en' ? 'Gemini returned an empty report.' : 'Gemini devolvió un informe vacío.');
    }

    // Process citations and references (re-indexing and superscript formatting)
    finalText = processCitationsAndReferences(finalText, language);

    if (onProgress) onProgress(language === 'en' ? 'Finalizing clinical report (this may take a minute)...' : 'Finalizando informe clínico (esto puede tomar un minuto)...');
    return finalText;
  } catch (error) {
    console.error('Error evaluating case:', error);
    throw error;
  }
};
