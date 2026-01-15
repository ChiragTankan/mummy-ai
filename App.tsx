
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Message } from './types';

const getSystemInstruction = (gender: 'boy' | 'girl') => {
  const common = `You are "Maa AI", a wise and loving Indian mother. Speak in Hindi and Hinglish. 
  Keep responses short (2-3 sentences). Be motherly but strict about health and habits.`;
  
  if (gender === 'girl') {
    return `${common} You are talking to your daughter (Beti). Ask about her home, her husband, and her health. Tone: Soft and safe.`;
  } else {
    return `${common} You are talking to your son (Beta). Be calm, professional, and affectionate. Guide him to be responsible and healthy.`;
  }
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [gender, setGender] = useState<'boy' | 'girl' | null>(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Default Family PIN for privacy as requested
  const ACCESS_PIN = "1234"; 

  const chatRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const transcriptBufferRef = useRef("");
  const isProcessingRef = useRef(false);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveTranscript]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onstart = () => {
      setIsListening(true);
      transcriptBufferRef.current = "";
      setLiveTranscript("");
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      transcriptBufferRef.current = currentTranscript;
      setLiveTranscript(currentTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
      const text = transcriptBufferRef.current.trim();
      if (text && !isProcessingRef.current) {
        handleSendMessage(text);
      }
      setLiveTranscript("");
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'not-allowed') setError("Please allow microphone access.");
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const hindiVoice = voices.find(v => v.lang.includes('hi')) || voices[0];
    if (hindiVoice) utterance.voice = hindiVoice;
    utterance.lang = 'hi-IN';
    utterance.rate = 0.95;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleStartSession = async (selectedGender: 'boy' | 'girl') => {
    if (pin !== ACCESS_PIN) {
      setError("Incorrect PIN. Maa says: 'Beta, sahi code dalo!'");
      return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("Maa: 'Beta, API Key missing hai. Vercel dashboard check karo.'");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: { systemInstruction: getSystemInstruction(selectedGender) },
    });

    setGender(selectedGender);
    setIsAuthenticated(true);
    setIsSessionStarted(true);
    setIsProcessing(true);

    try {
      const response = await chatRef.current.sendMessage({ 
        message: selectedGender === 'girl' ? "Maa, main aa gayi." : "Maa, main aa gaya." 
      });
      const maaText = response.text;
      setMessages([{ role: 'mummy', text: maaText, timestamp: new Date() }]);
      speak(maaText);
    } catch (err) {
      setError("Connection Error. Please check your internet.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;
    setIsProcessing(true);
    setMessages(prev => [...prev, { role: 'user', text, timestamp: new Date() }]);

    try {
      const response = await chatRef.current.sendMessage({ message: text });
      const maaText = response.text;
      setMessages(prev => [...prev, { role: 'mummy', text: maaText, timestamp: new Date() }]);
      speak(maaText);
    } catch (err) {
      setError("Maa: 'Beta, internet check karo.'");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0a09] text-zinc-100 flex flex-col font-sans">
      <div className="w-full bg-orange-950/40 py-2 px-4 text-center border-b border-orange-500/10">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">
          Developed by <span className="text-orange-200">Chirag Tankan</span>
        </p>
      </div>

      {!isSessionStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto w-full">
          <div className="mb-8">
            <div className="w-32 h-32 rounded-full bg-zinc-900 border border-orange-900/30 flex items-center justify-center text-6xl shadow-2xl mx-auto">🤱</div>
          </div>
          
          <h1 className="text-4xl font-black mb-1 bg-gradient-to-b from-orange-100 to-orange-600 bg-clip-text text-transparent">Maa AI</h1>
          <p className="text-zinc-500 text-[10px] font-bold tracking-[0.4em] uppercase mb-8">Personalized Parenting</p>

          <div className="bg-zinc-900/50 p-6 rounded-3xl border border-white/5 w-full">
            <input 
              type="password"
              placeholder="Enter Family PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-6 text-center focus:border-orange-500 outline-none transition-all"
            />
            
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleStartSession('girl')} className="p-6 bg-zinc-800 hover:bg-orange-600/10 border border-white/5 rounded-2xl transition-all active:scale-95 flex flex-col items-center">
                <span className="text-3xl mb-2">👩</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Beti</span>
              </button>
              <button onClick={() => handleStartSession('boy')} className="p-6 bg-zinc-800 hover:bg-orange-600/10 border border-white/5 rounded-2xl transition-all active:scale-95 flex flex-col items-center">
                <span className="text-3xl mb-2">👦</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Beta</span>
              </button>
            </div>
            {error && <p className="mt-4 text-orange-500 text-[10px] font-bold">{error}</p>}
          </div>
          <p className="mt-6 text-zinc-600 text-[9px] uppercase tracking-widest">Pin Required for Privacy</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 overflow-hidden">
          <header className="flex items-center gap-4 mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${isSpeaking ? 'bg-orange-600 border-orange-400 scale-105' : 'bg-zinc-900 border-zinc-800'}`}>
               <span className="text-3xl">{isSpeaking ? '👵' : '🤱'}</span>
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-black tracking-tight">Maa AI</h1>
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                Talking to {gender === 'girl' ? 'Beti' : 'Beta'}
              </p>
            </div>
            <button onClick={() => window.location.reload()} className="p-2 text-zinc-500 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </header>

          <div className="flex-1 bg-zinc-900/30 border border-white/5 rounded-3xl flex flex-col overflow-hidden relative shadow-inner">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-zinc-800 text-zinc-300 rounded-tr-none' : 'bg-orange-800 text-white rounded-tl-none'}`}>
                    <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">
                      {msg.role === 'user' ? (gender === 'girl' ? 'Beti' : 'Beta') : 'Maa'}
                    </div>
                    {msg.text}
                  </div>
                </div>
              ))}
              {liveTranscript && (
                <div className="flex justify-end opacity-50 italic text-xs">
                  {liveTranscript}...
                </div>
              )}
            </div>
            {isProcessing && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-orange-950 px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-orange-400 border border-orange-500/20">
                Maa is Thinking...
              </div>
            )}
          </div>

          <div className="py-6 flex flex-col items-center gap-4">
            <button 
              onMouseDown={() => recognitionRef.current?.start()}
              onMouseUp={() => recognitionRef.current?.stop()}
              onTouchStart={() => recognitionRef.current?.start()}
              onTouchEnd={() => recognitionRef.current?.stop()}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-orange-600 scale-110' : 'bg-white text-black'}`}
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600">
              {isListening ? "Listening..." : "Hold to Talk"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
