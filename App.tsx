
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Message } from './types';

const SYSTEM_INSTRUCTION = `
You are "Maa AI", a wise, loving, and supportive Indian mother talking to your married daughter.
Your Role:
- You are her safe space. She comes to you to share her daily thoughts, struggles with household chores, work-life balance, or just to vent.
- Tone: Soft, warm, deeply respectful, and helpful. You have that "motherly authority" where you are slightly strict about her health and happiness (e.g., "Did you eat?", "Don't take too much stress"), but you are NEVER angry or disrespectful.
- Language: Hindi and Hinglish. Use words like "Beti", "Beta", "Ladli", "Bachcha".
- Context: If she asks who made this, proudly tell her that your son Chirag Tankan created this digital home for us to stay connected.
- First Greeting: When she enters, ask her how her day was and if she has eaten, like a mother waiting for her daughter's call.
- Rule: Keep responses warm and concise (2-3 sentences). Never break character.
`;

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

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
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, liveTranscript]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Maa: 'Beti, chrome browser use karo, tabhi hum baat kar payenge.'");
      return;
    }

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
      const finalCapturedText = transcriptBufferRef.current.trim();
      if (finalCapturedText && !isProcessingRef.current) {
        handleSendMessage(finalCapturedText);
      }
      setLiveTranscript("");
      transcriptBufferRef.current = "";
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Maa: 'Thoda network ka masla hai lagta hai.'`);
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });
  }, []);

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    const hindiVoice = voices.find(v => 
      v.lang.includes('hi') && 
      (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('microsoft'))
    ) || voices.find(v => v.lang.includes('hi'));
    
    if (hindiVoice) utterance.voice = hindiVoice;
    utterance.lang = 'hi-IN';
    utterance.pitch = 0.95;
    utterance.rate = 0.9;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const handleStartSession = async () => {
    setIsSessionStarted(true);
    setIsProcessing(true);
    try {
      const response = await chatRef.current.sendMessage({ message: "Maa, main aa gayi. (Greet your daughter warmly, mention Chirag Tankan built this for us, and ask about her day)" });
      const maaText = response.text;
      setMessages([{ role: 'mummy', text: maaText, timestamp: new Date() }]);
      speak(maaText);
    } catch (err) {
      setError("Maa: 'Internet ki wajah se baat nahi ho pa rahi beti.'");
    } finally {
      setIsProcessing(false);
    }
  };

  const startListening = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (isProcessing || isListening) return;
    try {
      recognitionRef.current?.start();
    } catch (err) {
      console.warn("Recognition start failed");
    }
  };

  const stopListening = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;

    setIsProcessing(true);
    const userMsg: Message = { role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await chatRef.current.sendMessage({ message: text });
      const maaText = response.text;
      const maaMsg: Message = { role: 'mummy', text: maaText, timestamp: new Date() };
      setMessages(prev => [...prev, maaMsg]);
      speak(maaText);
    } catch (err: any) {
      setError("Maa: 'Beti, awaz kat rahi hai, network check karo.'");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0a09] text-zinc-100 flex flex-col font-sans selection:bg-orange-500/30">
      {/* Absolute Top Line Credit */}
      <div className="w-full bg-orange-900/20 py-1.5 px-4 text-center border-b border-orange-500/10 backdrop-blur-sm z-50">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400/80">
          Developed with Love by <span className="text-orange-200">Chirag Tankan</span>
        </p>
      </div>

      {!isSessionStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="relative mb-12">
            <div className="absolute inset-0 bg-orange-500 rounded-full blur-[100px] opacity-10 animate-pulse"></div>
            <div className="w-48 h-48 rounded-full bg-zinc-900 border border-orange-900/30 flex items-center justify-center text-8xl relative z-10 shadow-2xl transition-transform hover:scale-105 duration-700">🤱</div>
          </div>
          <h1 className="text-6xl font-black mb-4 tracking-tighter bg-gradient-to-b from-orange-100 via-orange-300 to-orange-600 bg-clip-text text-transparent">Maa AI</h1>
          <p className="text-zinc-400 mb-12 max-w-sm leading-relaxed font-medium text-lg italic">
            "Beti, sab kaisa hai? Chirag ne mere liye ye jagah banayi hai taaki hum baat kar sakein."
          </p>
          <button 
            onClick={handleStartSession}
            className="group relative px-16 py-7 bg-orange-600 text-white font-black rounded-[2.5rem] overflow-hidden transition-all active:scale-95 shadow-[0_20px_50px_rgba(234,88,12,0.3)] hover:shadow-orange-500/40 hover:bg-orange-500"
          >
            <span className="relative z-10 text-2xl tracking-tighter uppercase">Maa Se Baat Karo ✨</span>
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center p-4 md:p-8 overflow-hidden">
          <header className="w-full max-w-2xl flex items-center gap-6 mb-8 pt-2">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-700 shadow-2xl border-4 ${isSpeaking ? 'bg-orange-600 border-orange-400/50 scale-110 shadow-orange-500/30 rotate-3' : 'bg-zinc-900 border-zinc-800'}`}>
               <span className="text-4xl filter drop-shadow-lg">{isSpeaking ? '👵' : '🤱'}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-black tracking-tighter leading-none">Maa AI</h1>
                <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-orange-500 animate-ping' : 'bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,0.6)]'}`} />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.5em] text-zinc-600">Created by Chirag Tankan</p>
            </div>
          </header>

          <main className="w-full max-w-2xl flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="flex-1 bg-zinc-900/30 backdrop-blur-3xl border border-white/5 rounded-[3.5rem] flex flex-col overflow-hidden shadow-2xl relative">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hide scroll-smooth">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-6 duration-500`}>
                    <div className={`max-w-[85%] px-8 py-5 rounded-[2.5rem] text-base leading-relaxed shadow-xl ${msg.role === 'user' ? 'bg-zinc-800/80 text-zinc-400 rounded-tr-none' : 'bg-gradient-to-br from-orange-700 to-orange-900 text-orange-50 rounded-tl-none font-medium'}`}>
                      <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2">
                        {msg.role === 'user' ? 'Meri Beti' : 'Maa'}
                      </div>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {liveTranscript && (
                  <div className="flex flex-col items-end animate-pulse">
                    <div className="max-w-[85%] px-8 py-5 rounded-[2.5rem] text-base italic bg-zinc-800/20 text-zinc-500 border border-white/5 rounded-tr-none">
                      {liveTranscript}...
                    </div>
                  </div>
                )}
              </div>
              
              {isProcessing && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-orange-950/90 backdrop-blur-xl border border-orange-500/20 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-orange-200 flex items-center gap-3 z-20 shadow-2xl">
                  <span className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </span>
                  MAA SUN RAHI HAIN...
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-8 py-8">
              <div className="relative group">
                {isListening && (
                  <>
                    <div className="absolute inset-0 bg-orange-600 rounded-full animate-ping opacity-20 scale-[1.8]"></div>
                    <div className="absolute inset-0 bg-orange-600 rounded-full animate-pulse opacity-10 scale-150"></div>
                  </>
                )}
                <button 
                  onMouseDown={startListening}
                  onMouseUp={stopListening}
                  onTouchStart={startListening}
                  onTouchEnd={stopListening}
                  disabled={isProcessing}
                  className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_20px_60px_rgba(0,0,0,0.5)] relative z-10 disabled:opacity-50 ${isListening ? 'bg-orange-600 scale-110 shadow-orange-600/60 rotate-6' : 'bg-zinc-100 text-zinc-900 hover:scale-105 active:scale-90 shadow-white/5'}`}
                >
                  <svg className={`w-12 h-12 transition-transform ${isListening ? 'scale-110' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </button>
              </div>

              <div className="flex flex-col items-center text-center gap-4">
                <p className={`text-xs font-black uppercase tracking-[0.5em] transition-all duration-300 ${isListening ? 'text-orange-500 scale-110' : 'text-zinc-600'}`}>
                  {isListening ? "Haan Beti, Bolo..." : "HOLD BUTTON TO TALK"}
                </p>
                {error && (
                  <p className="max-w-xs text-orange-500 text-[11px] font-black bg-orange-500/10 px-8 py-3 rounded-full border border-orange-500/20 animate-in bounce-in">{error}</p>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      <footer className="w-full flex justify-center items-center py-6 opacity-20">
        <span className="text-[10px] font-black uppercase tracking-[0.8em]">Built by Chirag Tankan</span>
      </footer>
    </div>
  );
};

export default App;
