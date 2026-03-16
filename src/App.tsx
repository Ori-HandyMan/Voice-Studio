import { useState, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Activity } from 'lucide-react';
import VoiceCloningManager from './voice-cloning/VoiceCloningManager';
import { ClonedVoice } from './voice-cloning/types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export default function App() {
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);

  useEffect(() => {
    // Load saved voices on startup
    const saved = localStorage.getItem('cloned_voices');
    if (saved) {
      try {
        setClonedVoices(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved voices', e);
      }
    }
  }, []);

  const handleVoiceAdded = (voice: ClonedVoice) => {
    const updated = [...clonedVoices, voice];
    setClonedVoices(updated);
    localStorage.setItem('cloned_voices', JSON.stringify(updated));
  };

  const createWavUrlFromPcm = (base64Pcm: string, sampleRate: number = 24000): string => {
    const binaryString = window.atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const buffer = new ArrayBuffer(44 + bytes.length);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + bytes.length, true);
    writeString(8, 'WAVE');
    
    // FMT sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    
    // Data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, bytes.length, true);

    // Write PCM data
    const pcmData = new Uint8Array(buffer, 44);
    pcmData.set(bytes);

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  const handleAnalyzeAudio = async (audioBlob: Blob) => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64data = (reader.result as string).split(',')[1];
          resolve(base64data);
        };
      });
      reader.readAsDataURL(audioBlob);
      const base64Data = await base64Promise;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: audioBlob.type || 'audio/webm',
                }
              },
              {
                text: `Analyze this voice recording and provide a detailed summary report of the voice characteristics. 
Return the result as a JSON object with the following structure, and ensure all values are in Hebrew:
{
  "gender": "מגדר משוער (למשל: זכר, נקבה, לא ידוע)",
  "ageGroup": "קבוצת גיל משוערת (למשל: צעיר, גיל העמידה, מבוגר)",
  "pitch": "תיאור גובה הצליל (למשל: גבוה, בינוני, נמוך, עמוק)",
  "speed": "קצב דיבור (למשל: מהיר, מתון, איטי)",
  "tone": "טון הדיבור (למשל: חם, צורם, חלק, צרוד, ברור)",
  "emotion": "רגש או מצב רוח שזוהה (למשל: רגוע, אנרגטי, עצוב, שמח)",
  "accent": "מבטא או דיאלקט שזוהה (אם יש)",
  "summary": "פסקה קצרה המסכמת את פרופיל הקול הכללי בעברית."
}
Ensure the response is valid JSON without any markdown formatting.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      if (response.text) {
        return JSON.parse(response.text);
      }
      throw new Error("No analysis returned");
    } catch (error) {
      console.error("Error analyzing audio:", error);
      throw error;
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-indigo-200 pb-12">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-indigo-600 to-violet-600">
                מעבדת הקולות (Voice Lab)
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium border border-indigo-200">
                v1.1.0
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <VoiceCloningManager 
            onVoiceAdded={handleVoiceAdded} 
            clonedVoices={clonedVoices} 
            onAnalyzeAudio={handleAnalyzeAudio}
          />
        </div>
      </main>
    </div>
  );
}
