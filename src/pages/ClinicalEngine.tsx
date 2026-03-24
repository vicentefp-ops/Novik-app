import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { PatientData, Protocol, Leaflet } from '../types';
import { evaluateClinicalCase, anonymizeAndExtractClinicalData, askFollowUpQuestion } from '../services/geminiService';
import { collection, getDocs, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Stethoscope, Activity, AlertCircle, FileText, Pill, ChevronRight, Loader2, Paperclip, CheckCircle2, MessageSquare, Send, Download, PlusCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import clsx from 'clsx';

export default function ClinicalEngine() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PatientData>();
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    console.log('Loading state changed:', loading);
  }, [loading]);

  const [result, setResult] = useState<string | null>(null);
  const [activeProtocols, setActiveProtocols] = useState<Protocol[]>([]);
  const [activeLeaflets, setActiveLeaflets] = useState<Leaflet[]>([]);
  const [stats, setStats] = useState({ protocols: 0, leaflets: 0 });
  const [anonymizedText, setAnonymizedText] = useState<string>('');
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'ai', content: string}[]>([]);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [chatProgress, setChatProgress] = useState<string>('');
  const [currentPatientData, setCurrentPatientData] = useState<PatientData | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progress, setProgress] = useState(10);
  const [isExporting, setIsExporting] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (chatHistory.length > 0 || isAsking) {
      scrollToBottom();
    }
  }, [chatHistory, isAsking]);

  useEffect(() => {
    if (loading) {
      setProgress(10);
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 5, 95));
      }, 2000);
      return () => clearInterval(interval);
    } else {
      setProgress(100);
    }
  }, [loading]);

  useEffect(() => {
    fetchActiveDocuments();
  }, []);

  const fetchActiveDocuments = async () => {
    try {
      const pQuery = query(collection(db, 'protocols'), where('isActive', '==', true));
      const lQuery = query(collection(db, 'leaflets'), where('isActive', '==', true));
      
      const [pSnapshot, lSnapshot] = await Promise.all([getDocs(pQuery), getDocs(lQuery)]);
      
      const protocols = pSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Protocol));
      const leaflets = lSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Leaflet));
      
      setActiveProtocols(protocols);
      setActiveLeaflets(leaflets);
      setStats({ protocols: protocols.length, leaflets: leaflets.length });
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setIsAnonymizing(true);
    setUploadError(null);
    try {
      const results = await Promise.all(files.map(async (file) => {
        const text = await anonymizeAndExtractClinicalData(file);
        return `\n\n--- Documento: ${file.name} ---\n${text}`;
      }));
      setAnonymizedText(prev => prev + results.join(''));
    } catch (error) {
      console.error('Error processing files:', error);
      setUploadError('Error al procesar y anonimizar los documentos. Por favor, inténtalo de nuevo.');
    } finally {
      setIsAnonymizing(false);
      e.target.value = '';
    }
  };

  const handleAskQuestion = async () => {
    console.log('handleAskQuestion triggered. question:', question, 'isAsking:', isAsking, 'result exists:', !!result, 'patientData exists:', !!currentPatientData);
    if (isAsking || !question.trim() || !result || !currentPatientData) {
      console.warn('handleAskQuestion aborted due to missing requirements or already asking.');
      return;
    }
    
    const currentQuestion = question.trim();
    const newHistory = [...chatHistory, { role: 'user' as const, content: currentQuestion }];
    setChatHistory(newHistory);
    setQuestion('');
    setIsAsking(true);
    setChatProgress(language === 'en' ? 'Thinking...' : 'Pensando...');
    
    try {
      console.log('Calling askFollowUpQuestion...');
      const answer = await askFollowUpQuestion(currentPatientData, result, newHistory, currentQuestion, language, setChatProgress);
      console.log('askFollowUpQuestion response received.');
      setChatHistory([...newHistory, { role: 'ai' as const, content: answer }]);
    } catch (error) {
      console.error('Error asking follow-up:', error);
      alert('Error al procesar la pregunta.');
    } finally {
      setIsAsking(false);
      setChatProgress('');
    }
  };

  const onSubmit = async (data: PatientData) => {
    console.log('onSubmit called with data:', data);
    setLoading(true);
    setResult(null);
    setAnalysisError(null);
    setChatHistory([]);
    
    // Scroll to results section
    setTimeout(() => {
      const resultsEl = document.getElementById('results-section');
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    
    const fullData = { 
      ...data, 
      attachedDocumentsText: anonymizedText,
      weightUnit: user?.weightUnit || 'kg',
      heightUnit: user?.heightUnit || 'cm'
    };
    setCurrentPatientData(fullData);

    try {
      console.log('Starting evaluateClinicalCase...');
      setProgressStatus(language === 'en' ? 'Starting analysis...' : 'Iniciando análisis...');
      console.log('Calling evaluateClinicalCase with:', { fullData, activeProtocols, activeLeaflets, language });
      const recommendation = await evaluateClinicalCase(fullData, activeProtocols, activeLeaflets, language, setProgressStatus);
      console.log('evaluateClinicalCase completed successfully. Recommendation length:', recommendation.length);
      setResult(recommendation);

      // Save audit log
      if (user) {
        try {
          await addDoc(collection(db, 'cases'), {
            userId: user.uid,
            patientData: JSON.stringify(data),
            recommendation,
            protocolsUsed: activeProtocols.map(p => p.id),
            leafletsUsed: activeLeaflets.map(l => l.id),
            createdAt: serverTimestamp()
          });
        } catch (dbError) {
          console.error('Error saving case to Firestore:', dbError);
        }
      }
    } catch (error: any) {
      console.error('Error evaluating case:', error);
      let errorMessage = language === 'en' ? 'Error evaluating clinical case. Please try again.' : 'Error al evaluar el caso clínico. Por favor, inténtalo de nuevo.';
      
      if (error?.message) {
        try {
          const parsedError = JSON.parse(error.message);
          if (parsedError.error?.message) {
            errorMessage = `${language === 'en' ? 'API Error' : 'Error de la API'}: ${parsedError.error.message}`;
          }
        } catch (e) {
          if (error.message.includes('Quota exceeded')) {
            errorMessage = language === 'en' ? 'Gemini API quota exceeded. Please wait a moment.' : 'Se ha superado la cuota de la API de Gemini. Por favor, espera un momento.';
          } else if (error.message.includes('ToolConfig')) {
            errorMessage = language === 'en' ? 'API tool configuration error.' : 'Error en la configuración de herramientas de la API.';
          } else if (error.message.length < 200) {
            errorMessage = error.message;
          }
        }
      }
      
      setAnalysisError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConsultation = () => {
    reset();
    setResult(null);
    setChatHistory([]);
    setCurrentPatientData(null);
    setAnonymizedText('');
    setQuestion('');
  };

  const exportToPDF = () => {
    const isIframe = window.self !== window.top;
    
    if (isIframe) {
      // En iframes (como la vista previa), window.print() puede estar bloqueado.
      // Abrimos una nueva pestaña con el contenido a imprimir.
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Por favor, permite las ventanas emergentes para exportar el PDF.');
        return;
      }
      
      const element = document.getElementById('pdf-content');
      if (!element) return;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Informe Clínico - Novik</title>
            ${document.head.innerHTML}
            <style>
              @page {
                size: auto;
                margin: 20mm;
              }
              body { 
                padding: 0 !important; 
                background: white !important;
                margin: 0 !important;
                overflow: visible !important;
                height: auto !important;
              }
              #pdf-content {
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
              }
              [data-html2canvas-ignore="true"] { display: none !important; }
              
              /* Ensure content can break across pages */
              .page-break-inside-avoid {
                break-inside: avoid;
              }
            </style>
          </head>
          <body>
            <div id="pdf-content" class="bg-white">
              ${element.innerHTML}
            </div>
            <script>
              // Esperar a que carguen las fuentes e imágenes
              window.onload = () => {
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 800);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      // Si no estamos en un iframe, usamos la impresión nativa directamente
      window.print();
    }
  };

  const renderResultSections = () => {
    if (!result) return null;
    
    // Split by ### headers
    const sections = result.split(/(?=###\s+)/);
    
    return sections.filter(s => s.trim().length > 0).map((section, idx) => {
      // Extract title and content
      const lines = section.split('\n');
      let title = '';
      let content = section;
      
      if (lines[0].trim().startsWith('###')) {
        title = lines[0].replace(/^###\s*/, '').trim();
        content = lines.slice(1).join('\n').trim();
      }
      
      return (
        <div key={idx} className="mb-6 rounded-xl border border-olive-200 overflow-hidden page-break-inside-avoid shadow-sm">
          {title && (
            <div className="bg-olive-50 border-b border-olive-200 px-6 py-4">
              <h3 className="text-lg font-bold text-olive-800 m-0">{title}</h3>
            </div>
          )}
          <div className="p-6 prose prose-slate prose-olive max-w-none prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-olive-200 prose-th:bg-olive-50 prose-th:text-olive-800 prose-th:p-3 prose-td:border prose-td:border-olive-100 prose-td:p-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                a: ({ node, children, ...props }) => {
                  if (props.href?.startsWith('#ref-')) {
                    return (
                      <sup className="text-xs align-super">
                        <a 
                          {...props} 
                          onClick={(e) => {
                            e.preventDefault();
                            const target = document.getElementById(props.href!.substring(1));
                            if (target) {
                              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }}
                          className="text-olive-600 hover:text-olive-800 underline decoration-olive-300 underline-offset-2 cursor-pointer transition-colors" 
                        >
                          {children}
                        </a>
                      </sup>
                    );
                  }
                  if (props.href?.startsWith('#')) {
                    return (
                      <a 
                        {...props} 
                        onClick={(e) => {
                          e.preventDefault();
                          const target = document.querySelector(props.href as string);
                          if (target) {
                            target.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className="text-olive-600 hover:text-olive-800 underline decoration-olive-300 underline-offset-2 cursor-pointer transition-colors" 
                      >
                        {children}
                      </a>
                    );
                  }
                  return <a {...props} target="_blank" rel="noopener noreferrer" className="text-olive-600 hover:text-olive-800 underline" >{children}</a>;
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Form Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Stethoscope className="w-7 h-7 text-olive-600" />
              {t('evaluationTitle')}
            </h1>
            <p className="text-slate-500 mt-1">{t('evaluationDesc')}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('age')}</label>
              <input
                type="number"
                {...register('age', { required: true, min: 0, max: 120 })}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
                placeholder="45"
              />
              {errors.age && <p className="text-red-500 text-xs mt-1">Campo requerido</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('weight')} ({user?.weightUnit || 'kg'})
              </label>
              <input
                type="number"
                step="1"
                {...register('weight', { required: true, min: 1, max: 500 })}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
                placeholder="70"
              />
              {errors.weight && <p className="text-red-500 text-xs mt-1">Campo requerido</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('height')} ({user?.heightUnit || 'cm'}) <span className="text-slate-400 font-normal text-xs">(Opcional)</span>
              </label>
              <input
                type="number"
                step={user?.heightUnit === 'ft' ? "0.1" : "1"}
                {...register('height', { required: false, min: 1, max: 300 })}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
                placeholder={user?.heightUnit === 'ft' ? "5.9" : "175"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('sex')}</label>
              <select
                {...register('sex', { required: true })}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
              >
                <option value="">{t('select')}</option>
                <option value="M">{t('male')}</option>
                <option value="F">{t('female')}</option>
                <option value="O">{t('other')}</option>
              </select>
              {errors.sex && <p className="text-red-500 text-xs mt-1">Campo requerido</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('procedure')}</label>
            <input
              type="text"
              {...register('procedure', { required: true })}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
              placeholder={t('procedurePlaceholder')}
            />
            {errors.procedure && <p className="text-red-500 text-xs mt-1">Campo requerido</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('pathologies')}</label>
            <textarea
              {...register('currentPathologies')}
              rows={2}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
              placeholder={t('pathologiesPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('medication')}</label>
            <textarea
              {...register('medication')}
              rows={2}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
              placeholder={t('medicationPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('allergies')}</label>
            <textarea
              {...register('allergies')}
              rows={2}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-olive-500 focus:border-olive-500"
              placeholder={t('allergiesPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">{t('documents')}</label>
            <div className="relative">
              <label className={clsx(
                "flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all group",
                isAnonymizing 
                  ? "bg-slate-50 border-slate-200 opacity-70 cursor-not-allowed" 
                  : "bg-olive-50/30 border-olive-200 hover:bg-olive-50 hover:border-olive-400"
              )}>
                <div className={clsx(
                  "p-3 rounded-full transition-colors",
                  isAnonymizing ? "bg-slate-100" : "bg-olive-100 group-hover:bg-olive-200"
                )}>
                  {isAnonymizing ? (
                    <Loader2 className="w-6 h-6 animate-spin text-olive-600" />
                  ) : (
                    <Paperclip className="w-6 h-6 text-olive-600" />
                  )}
                </div>
                <div className="text-center">
                  <span className="block text-sm font-bold text-olive-900">
                    {isAnonymizing ? t('uploading') : t('uploadPrompt')}
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    PDF o Imágenes (Máx. 10MB)
                  </span>
                </div>
                <input type="file" className="hidden" accept="image/*,.pdf" multiple onChange={handleFileUpload} disabled={isAnonymizing} />
              </label>
            </div>
            {anonymizedText && !uploadError && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-800">
                  <p className="font-medium">{t('uploadSuccess')}</p>
                  <p className="text-xs mt-1 opacity-80">{t('uploadSuccessDesc')}</p>
                </div>
              </div>
            )}
            {uploadError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg flex gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-medium">Error</p>
                  <p className="text-xs mt-1 opacity-80">{uploadError}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {t('warning')}
            </p>
          </div>

          {analysisError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-bold">{language === 'en' ? 'Analysis Error' : 'Error de Análisis'}</p>
                <p>{analysisError}</p>
                <button 
                  onClick={() => handleSubmit(onSubmit)()} 
                  className="mt-2 text-red-700 underline font-medium hover:text-red-900"
                >
                  {language === 'en' ? 'Try again' : 'Reintentar'}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-olive-600 text-white rounded-xl hover:bg-olive-700 disabled:opacity-70 transition-colors font-semibold text-lg shadow-sm"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Activity className="w-6 h-6" />}
            {loading ? t('analyzingBtn') : t('analyzeBtn')}
          </button>
        </form>
        </div>

        {/* Results Section */}
        <div id="results-section" className="scroll-mt-8">
          {loading ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 flex flex-col items-center justify-center text-slate-500 space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-olive-600" />
              <p className="text-lg font-medium">{t('evaluating')}</p>
              <p className="text-sm text-center max-w-md">{progressStatus || t('evaluatingDesc')}</p>
              {progressStatus && (
                <div className="w-full max-w-xs bg-slate-100 rounded-full h-2 mt-4 overflow-hidden">
                  <div className="bg-olive-600 h-2 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                </div>
              )}
            </div>
          ) : result ? (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-olive-600" />
                  {t('clinicalReport')}
                </h2>
                <div className="flex gap-3">
                  <button 
                    onClick={exportToPDF} 
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium shadow-sm"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isExporting ? t('exportingPDF') : t('exportPDF')}
                  </button>
                  <button 
                    onClick={handleNewConsultation} 
                    className="flex items-center gap-2 px-4 py-2 bg-olive-50 text-olive-700 border border-olive-100 rounded-lg hover:bg-olive-100 transition-colors text-sm font-medium shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {t('newConsultation')}
                  </button>
                </div>
              </div>

              <div id="pdf-content" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                {renderResultSections()}
                <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
                  <p>{t('generatedBy')}</p>
                  <p>{t('reviewWarning')}</p>
                </div>

                {/* Follow-up Chat */}
                <div className="mt-12 border-t-2 border-olive-100 pt-8" data-html2canvas-ignore="true">
                  <div className="bg-olive-50/50 rounded-2xl p-6 border border-olive-100">
                    <h3 className="text-xl font-bold text-olive-900 mb-6 flex items-center gap-3">
                      <MessageSquare className="w-6 h-6 text-olive-600" />
                      {t('anyDoubts')}
                    </h3>
                    
                    {chatHistory.length > 0 && (
                      <div className="space-y-6 mb-8">
                        {chatHistory.map((msg, idx) => (
                          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] p-5 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-olive-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-olive-100'}`}>
                              <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-slate prose-olive'}`}>
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm]}
                                  rehypePlugins={[rehypeRaw]}
                                  components={{
                                    a: ({ node, children, ...props }) => {
                                      if (props.href?.startsWith('#ref-')) {
                                        return (
                                          <sup className="text-xs align-super">
                                            <a 
                                              {...props} 
                                              onClick={(e) => {
                                                e.preventDefault();
                                                const target = document.getElementById(props.href!.substring(1));
                                                if (target) {
                                                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                }
                                              }}
                                              className={msg.role === 'user' ? 'text-olive-200 hover:text-white underline decoration-olive-300 underline-offset-2 cursor-pointer transition-colors' : 'text-olive-600 hover:text-olive-800 underline decoration-olive-300 underline-offset-2 cursor-pointer transition-colors'} 
                                            >
                                              {children}
                                            </a>
                                          </sup>
                                        );
                                      }
                                      if (props.href?.startsWith('#')) {
                                        return (
                                          <a 
                                            {...props} 
                                            onClick={(e) => {
                                              e.preventDefault();
                                              const target = document.querySelector(props.href as string);
                                              if (target) {
                                                target.scrollIntoView({ behavior: 'smooth' });
                                              }
                                            }}
                                            className={msg.role === 'user' ? 'text-olive-200 hover:text-white underline decoration-olive-300 underline-offset-2 cursor-pointer transition-colors' : 'text-olive-600 hover:text-olive-800 underline decoration-olive-300 underline-offset-2 cursor-pointer transition-colors'} 
                                          >
                                            {children}
                                          </a>
                                        );
                                      }
                                      return <a {...props} target="_blank" rel="noopener noreferrer" className={msg.role === 'user' ? 'text-olive-200 hover:text-white underline' : 'text-olive-600 hover:text-olive-800 underline'} >{children}</a>;
                                    }
                                  }}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        ))}
                        {isAsking && (
                          <div className="flex justify-start">
                            <div className="bg-white border border-olive-100 text-slate-500 p-5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-4">
                              <Loader2 className="w-5 h-5 animate-spin text-olive-600" />
                              <span className="text-sm italic font-medium">{chatProgress}</span>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
  
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <input 
                          type="text" 
                          value={question}
                          onChange={e => setQuestion(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAskQuestion()}
                          placeholder={t('askPlaceholder')}
                          className="w-full p-4 border border-olive-200 rounded-xl focus:ring-2 focus:ring-olive-500 focus:border-olive-500 bg-white shadow-inner"
                          disabled={isAsking}
                        />
                      </div>
                      <button 
                        onClick={handleAskQuestion}
                        disabled={isAsking || !question.trim()}
                        className="p-4 bg-olive-600 text-white rounded-xl hover:bg-olive-700 disabled:opacity-50 transition-all flex items-center justify-center shadow-md hover:shadow-lg active:scale-95 h-[58px] w-[58px]"
                      >
                        {isAsking ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex justify-end gap-3 mt-2">
                <button 
                  onClick={exportToPDF} 
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium shadow-sm"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isExporting ? t('exportingPDF') : t('exportPDF')}
                </button>
                <button 
                  onClick={handleNewConsultation} 
                  className="flex items-center gap-2 px-4 py-2 bg-olive-50 text-olive-700 border border-olive-100 rounded-lg hover:bg-olive-100 transition-colors text-sm font-medium shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  {t('newConsultation')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
