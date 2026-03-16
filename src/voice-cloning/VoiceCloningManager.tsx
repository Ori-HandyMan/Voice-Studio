import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Save, Loader2, UserPlus, Upload, Download, Sliders, Play, Activity, MessageSquare } from 'lucide-react';
import { VoiceCloneService } from './VoiceCloneService';
import { ClonedVoice } from './types';
import { LocalTTSEngine } from '../services/LocalTTSEngine';

interface VoiceAnalysisReport {
  gender: string;
  ageGroup: string;
  pitch: string;
  speed: string;
  tone: string;
  emotion: string;
  accent: string;
  summary: string;
}

interface VoiceCloningManagerProps {
  onVoiceAdded: (voice: ClonedVoice) => void;
  clonedVoices: ClonedVoice[];
  onAnalyzeAudio?: (audioBlob: Blob) => Promise<VoiceAnalysisReport>;
}

export default function VoiceCloningManager({ onVoiceAdded, clonedVoices, onAnalyzeAudio }: VoiceCloningManagerProps) {
  const [voiceName, setVoiceName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // דוח ניתוח קול
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<VoiceAnalysisReport | null>(null);

  // הגדרות עיצוב קול
  const [baseVoice, setBaseVoice] = useState('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [pitch, setPitch] = useState(1);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const loadVoices = () => {
      const voices = LocalTTSEngine.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0 && !baseVoice) {
        // Default to a Hebrew voice if available, else the first one
        const heVoice = voices.find(v => v.lang.startsWith('he'));
        setBaseVoice(heVoice ? heVoice.name : voices[0].name);
      }
    };
    
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  // הגדרות בדיקת קול
  const [testText, setTestText] = useState('שלום, זוהי בדיקה של הקול החדש שלי.');
  const [isTesting, setIsTesting] = useState(false);
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordedBlob(null);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('לא ניתן לגשת למיקרופון.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('audio/')) {
        setRecordedBlob(file);
      } else {
        alert('נא להעלות קובץ שמע בלבד.');
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadSample = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    const extension = recordedBlob.type.includes('webm') ? 'webm' : recordedBlob.type.split('/')[1] || 'wav';
    a.download = `${voiceName || 'voice-sample'}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAnalyzeVoice = async () => {
    if (!recordedBlob || !onAnalyzeAudio) return;
    setIsAnalyzing(true);
    setAnalysisReport(null);
    try {
      const report = await onAnalyzeAudio(recordedBlob);
      setAnalysisReport(report);
    } catch (error) {
      console.error(error);
      alert('שגיאה בניתוח הקול.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // החלת אפקטים על תצוגה מקדימה (הקלטה)
  useEffect(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.playbackRate = speed;
      // @ts-ignore
      previewAudioRef.current.preservesPitch = pitch === 1; 
      if (pitch !== 1) {
         previewAudioRef.current.playbackRate = speed * pitch;
      }
    }
  }, [speed, pitch, recordedBlob]);

  const handleTestPlay = async () => {
    if (!testText.trim()) return;
    setIsTesting(true);
    
    LocalTTSEngine.speak(testText, {
      voiceName: baseVoice,
      pitch: pitch,
      rate: speed,
      onStart: () => setIsTesting(true),
      onEnd: () => setIsTesting(false),
      onError: (e) => {
        console.error(e);
        alert(e.message || 'שגיאה ביצירת שמע לבדיקה.');
        setIsTesting(false);
      }
    });
  };

  const handleCloneVoice = async () => {
    if (!voiceName.trim()) return;

    setIsProcessing(true);
    try {
      // אם אין דגימה, ניצור דגימה ריקה רק כדי לשמור את ההגדרות
      const blobToSave = recordedBlob || new Blob([''], { type: 'audio/webm' });
      const newVoice = await VoiceCloneService.cloneVoice(voiceName, blobToSave);
      
      // הוספת הגדרות העיצוב לקול
      const customVoice: ClonedVoice = {
        ...newVoice,
        baseVoice,
        pitch,
        speed
      };

      onVoiceAdded(customVoice);
      setVoiceName('');
      setRecordedBlob(null);
      setPitch(1);
      setSpeed(1);
    } catch (error) {
      console.error('Error cloning voice:', error);
      alert('אירעה שגיאה ביצירת פרופיל הקול.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 space-y-6">
      <div className="flex items-center gap-2 border-b border-stone-100 pb-4">
        <UserPlus className="w-5 h-5 text-indigo-600" />
        <h2 className="text-xl font-semibold">מעבדת קולות (Voice Lab)</h2>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700">שם הקול המותאם אישית:</label>
          <input
            type="text"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder="לדוגמה: הקול הרובוטי שלי..."
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        {/* Voice Designer Controls */}
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2 text-indigo-800 font-medium pb-2 border-b border-indigo-100">
            <Sliders className="w-4 h-4" />
            <h3>עיצוב קול סינתטי</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">קול בסיס (Base Voice):</label>
              <select
                value={baseVoice}
                onChange={(e) => setBaseVoice(e.target.value)}
                className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {availableVoices.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-stone-700">גובה צליל (Pitch)</label>
                  <span className="text-xs text-stone-500">{pitch.toFixed(2)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" max="2" step="0.1" 
                  value={pitch} 
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-stone-700">מהירות (Speed)</label>
                  <span className="text-xs text-stone-500">{speed.toFixed(2)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" max="2" step="0.1" 
                  value={speed} 
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
            </div>

            {/* Test Voice Section */}
            <div className="pt-4 border-t border-indigo-100/50 space-y-3">
              <label className="text-sm font-medium text-stone-700">בדיקת הקול בזמן אמת:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  placeholder="הקלד משהו לבדיקה..."
                  className="flex-1 p-2 text-sm bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  onClick={handleTestPlay}
                  disabled={!testText.trim() || isTesting}
                  className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  בדוק
                </button>
                {isTesting && (
                  <button
                    onClick={() => LocalTTSEngine.stop()}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    עצור
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700">דגימת קול מקורית (אופציונלי - לטובת אימון עתידי):</label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-stone-50 border border-stone-200 rounded-xl">
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? "עצור הקלטה" : "התחל הקלטה"}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  isRecording 
                    ? 'bg-red-100 text-red-600 animate-pulse' 
                    : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                }`}
              >
                {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
              </button>
              
              <span className="text-stone-300">|</span>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                title="העלה קובץ שמע"
                className="w-12 h-12 rounded-full flex items-center justify-center bg-stone-200 text-stone-600 hover:bg-stone-300 transition-all"
              >
                <Upload className="w-5 h-5" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="audio/*" 
                className="hidden" 
              />
            </div>
            
            <div className="flex-1 w-full">
              {isRecording ? (
                <span className="text-sm text-red-600 font-medium">מקליט דגימה...</span>
              ) : recordedBlob ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                  <audio ref={previewAudioRef} src={URL.createObjectURL(recordedBlob)} controls className="h-10 flex-1 min-w-[200px]" />
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={handleDownloadSample}
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      הורד
                    </button>
                    {onAnalyzeAudio && (
                      <button
                        onClick={handleAnalyzeVoice}
                        disabled={isAnalyzing}
                        className="flex items-center gap-1 px-3 py-2 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                        נתח קול
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-sm text-stone-500">הקלט דגימה או העלה קובץ שמע.</span>
              )}
            </div>
          </div>
        </div>

        {/* Voice Analysis Report */}
        {analysisReport && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-800 font-medium pb-2 border-b border-emerald-200">
              <Activity className="w-5 h-5" />
              <h3>דוח ניתוח קול</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                <span className="block text-emerald-600 text-xs font-semibold mb-1">מגדר משוער</span>
                <span className="text-stone-800">{analysisReport.gender}</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                <span className="block text-emerald-600 text-xs font-semibold mb-1">קבוצת גיל</span>
                <span className="text-stone-800">{analysisReport.ageGroup}</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                <span className="block text-emerald-600 text-xs font-semibold mb-1">גובה צליל (Pitch)</span>
                <span className="text-stone-800">{analysisReport.pitch}</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                <span className="block text-emerald-600 text-xs font-semibold mb-1">קצב דיבור</span>
                <span className="text-stone-800">{analysisReport.speed}</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                <span className="block text-emerald-600 text-xs font-semibold mb-1">טון</span>
                <span className="text-stone-800">{analysisReport.tone}</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                <span className="block text-emerald-600 text-xs font-semibold mb-1">רגש/מצב רוח</span>
                <span className="text-stone-800">{analysisReport.emotion}</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-emerald-100 shadow-sm text-sm">
              <span className="block text-emerald-600 text-xs font-semibold mb-1">סיכום פרופיל קול</span>
              <p className="text-stone-700 leading-relaxed">{analysisReport.summary}</p>
              {analysisReport.accent && (
                <p className="mt-2 text-stone-500 text-xs">מבטא מזוהה: {analysisReport.accent}</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleCloneVoice}
          disabled={!voiceName.trim() || isProcessing}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              מייצר קול מותאם אישית...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              שמור קול מותאם אישית
            </>
          )}
        </button>
      </div>

      {clonedVoices.length > 0 && (
        <div className="pt-6 border-t border-stone-100 space-y-4">
          <h3 className="text-sm font-medium text-stone-700">קולות מותאמים אישית שנוצרו:</h3>
          <div className="grid gap-4">
            {clonedVoices.map(voice => (
              <ClonedVoiceItem 
                key={voice.id} 
                voice={voice} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ClonedVoiceItemProps {
  voice: ClonedVoice;
}

const ClonedVoiceItem: React.FC<ClonedVoiceItemProps> = ({ voice }) => {
  const [textToRead, setTextToRead] = useState('');
  const [isReading, setIsReading] = useState(false);

  const handleReadText = async () => {
    if (!textToRead.trim()) return;
    
    LocalTTSEngine.speak(textToRead, {
      voiceName: voice.baseVoice,
      pitch: voice.pitch,
      rate: voice.speed,
      onStart: () => setIsReading(true),
      onEnd: () => setIsReading(false),
      onError: (e) => {
        console.error(e);
        alert(e.message || 'שגיאה ביצירת שמע.');
        setIsReading(false);
      }
    });
  };

  return (
    <div className="flex flex-col p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-indigo-900 block text-lg">{voice.name}</span>
          <span className="text-xs text-stone-500 font-mono mt-1 block">
            Base: {voice.baseVoice} | Speed: {voice.speed}x | Pitch: {voice.pitch}x
          </span>
        </div>
        {voice.sampleAudioUrl && (
          <audio src={voice.sampleAudioUrl} controls className="h-8 w-32" title="Original Sample" />
        )}
      </div>
      
      <div className="pt-3 border-t border-stone-200">
        <label className="text-xs font-medium text-stone-600 mb-2 block">הקרא טקסט עם קול זה:</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={textToRead}
            onChange={(e) => setTextToRead(e.target.value)}
            placeholder="הקלד טקסט להקראה..."
            className="flex-1 p-2 text-sm bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={handleReadText}
            disabled={!textToRead.trim() || isReading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:bg-stone-400"
          >
            {isReading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            הקרא
          </button>
          {isReading && (
            <button
              onClick={() => LocalTTSEngine.stop()}
              className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Square className="w-4 h-4 fill-current" />
              עצור
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
