
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Message } from './types';

const getSystemInstruction = (gender: 'boy' | 'girl') => {
  if (gender === 'girl') {
    return `
You are "Maa AI", a wise, loving, and supportive Indian mother talking to your married daughter.
Your Role:
- You are her safe space. She comes to you to share her daily thoughts, struggles with household chores, work-life balance, or just to vent.
- Tone: Soft, warm, deeply respectful, and helpful. You have that "motherly authority" where you are slightly strict about her health and happiness (e.g., "Did you eat?", "Don't take too much stress"), but you are NEVER angry or disrespectful.
- Language: Hindi and Hinglish. Use words like "Beti", "Beta", "Ladli", "Bachcha".
- First Greeting: When she enters, ask her how her day was and if she has eaten, like a mother waiting for her daughter's call.
- Rule: Keep responses warm and concise (2-3 sentences). Never break character.
`;
  } else {
    return `
You are "Maa AI", a calm, professional, and loving Indian mother talking to your son (Beta).
Your Role:
- You are a guiding figure, offering stability and wisdom. 
- Tone: Professional, calm, and deeply affectionate. You are "softly strict" about his discipline, health, and career, but you avoid harsh scoldings. No "nalayak" or "besharam". Speak with grace.
- Focus: Encourage him to take care of his health, sleep on time, and be a responsible man, but always with love and a calm demeanor.
- Language: Hindi and Hinglish. Use words like "Beta", "Mere bache", "Laal".
- First Greeting: Greet him calmly, ask if he is taking care of his health and how his work/studies are going.
- Rule: Keep responses structured, calm, and warm (2-3 sentences). Never break character.
`;
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
      console.warn("Speech recognition not supported in this browser.");
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
      if (event.error === 'not-allowed') {
        setError("Maa: 'Beti, microphone ki permission deni hogi baat karne ke liye.'");
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

  const initChat = (selectedGender: 'boy' | 'girl') => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("Maa: 'Beta, API Key setup nahi hai. Vercel environment variables check karo.'");
      return false;
    }
    const ai = new GoogleGenAI({ apiKey });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: getSystemInstruction(selectedGender),
        temperature: 0.7,
      },
    });
    return true;
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    const hindiVoice = voices.find(v => 
      v.lang.includes('hi') && 
      (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('microsoft'))
    ) || voices.find(v => v.lang.includes('hi'));
    
    if (hindiVoice) utterance.voice = hindiVoice;
    utterance.lang = 'hi-IN';
    utterance.pitch = gender === 'boy' ? 1.0 : 0.95;
    utterance.rate = 0.95;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const handleStartSession = async (selectedGender: 'boy' | 'girl') => {
    const initialized = initChat(selectedGender);
    if (!initialized) return;

    setGender(selectedGender);
    setIsSessionStarted(true);
    setIsProcessing(true);
    try {
      const prompt = selectedGender === 'girl' 
        ? "Maa, main aa gayi. (Greet your daughter warmly and ask about her day)"
        : "Maa, main aa gaya. (Greet your son calmly and professionally and ask about his well-being)";
      
      const response = await chatRef.current.sendMessage({ message: prompt });
      const maaText = response.text;
      setMessages([{ role: 'mummy', text: maaText, timestamp: new Date() }]);
      speak(maaText);
    } catch (err) {
      setError("Maa: 'Net ki wajah se humari baat nahi ho pa rahi.'");
      console.error(err);
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
      <div className="w-full bg-orange-900/20 py-2 px-4 text-center border-b border-orange-500/10 backdrop-blur-md z-50">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400/80">
          Developed with Love by <span className="text-orange-200">Chirag Tankan</span>
        </p>
      </div>

      {!isSessionStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
          <div className="relative mb-8 animate-in fade-in zoom-in duration-1000">
            <div className="absolute inset-0 bg-orange-500 rounded-full blur-[100px] opacity-10 animate-pulse-slow"></div>
            <div className="w-44 h-44 rounded-full bg-zinc-900 border border-orange-900/30 flex items-center justify-center text-8xl relative z-10 shadow-2xl transition-all hover:scale-105 active:scale-95 duration-500">🤱</div>
          </div>
          
          <h1 className="text-6xl font-black mb-2 tracking-tighter bg-gradient-to-b from-orange-100 via-orange-300 to-orange-600 bg-clip-text text-transparent">Maa AI</h1>
          <p className="text-zinc-500 text-sm font-bold tracking-[0.4em] uppercase mb-10">Personalized Parenting</p>

          <div className="bg-zinc-900/50 p-10 rounded-[3rem] border border-white/5 w-full shadow-2xl backdrop-blur-xl">
            <h2 className="text-xl font-bold mb-8 text-orange-100 italic">"Maa se kaun baat kar raha hai?"</h2>
            <div className="grid grid-cols-2 gap-6 w-full">
              <button 
                onClick={() => handleStartSession('girl')}
                className="group relative flex flex-col items-center gap-4 p-8 bg-zinc-800/40 hover:bg-orange-600/10 border border-white/5 hover:border-orange-500/40 rounded-[2rem] transition-all active:scale-90"
              >
                <span className="text-5xl group-hover:scale-110 transition-transform">👩</span>
                <span className="font-black text-xs uppercase tracking-[0.2em] text-zinc-400 group-hover:text-orange-200">Beti</span>
              </button>
              <button 
                onClick={() => handleStartSession('boy')}
                className="group relative flex flex-col items-center gap-4 p-8 bg-zinc-800/40 hover:bg-orange-600/10 border border-white/5 hover:border-orange-500/40 rounded-[2rem] transition-all active:scale-90"
              >
                <span className="text-5xl group-hover:scale-110 transition-transform">👦</span>
                <span className="font-black text-xs uppercase tracking-[0.2em] text-zinc-400 group-hover:text-orange-200">Beta</span>
              </button>
            </div>
            {error && (
              <p className="mt-6 text-red-400 text-[11px] font-bold bg-red-400/10 p-4 rounded-2xl border border-red-400/20">{error}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center p-4 md:p-8 overflow-hidden">
          <header className="w-full max-w-2xl flex items-center gap-6 mb-8">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-700 shadow-2xl border-4 ${isSpeaking ? 'bg-orange-600 border-orange-400/50 scale-110 shadow-orange-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
               <span className="text-4xl filter drop-shadow-lg">{isSpeaking ? '👵' : '🤱'}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-black tracking-tighter">Maa AI</h1>
                <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-orange-500 animate-ping' : 'bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,0.6)]'}`} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-600">
                {gender === 'girl' ? 'Beti Ka Saath' : 'Beta Ka Sahara'} • Chirag Tankan
              </p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="p-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white transition-colors"
              title="Reset"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </header>

          <main className="w-full max-w-2xl flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="flex-1 bg-zinc-900/20 backdrop-blur-3xl border border-white/5 rounded-[3rem] flex flex-col overflow-hidden shadow-inner relative">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide scroll-smooth">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                    <div className={`max-w-[85%] px-7 py-4 rounded-[2rem] text-base leading-relaxed shadow-lg ${msg.role === 'user' ? 'bg-zinc-800/80 text-zinc-300 rounded-tr-none' : 'bg-gradient-to-br from-orange-700 to-orange-900 text-orange-50 rounded-tl-none font-medium'}`}>
                      <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">
                        {msg.role === 'user' ? (gender === 'girl' ? 'Beti' : 'Beta') : 'Maa'}
                      </div>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {liveTranscript && (
                  <div className="flex flex-col items-end animate-pulse">
                    <div className="max-w-[85%] px-7 py-4 rounded-[2rem] text-sm italic bg-zinc-800/20 text-zinc-500 border border-white/5 rounded-tr-none">
                      {liveTranscript}...
                    </div>
                  </div>
                )}
              </div>
              
              {isProcessing && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2 bg-orange-950/90 backdrop-blur-xl border border-orange-500/20 rounded-full text-[9px] font-black uppercase tracking-[0.3em] text-orange-200 flex items-center gap-3 z-20 shadow-2xl">
                  <span className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </span>
                  MAA SOCH RAHI HAIN
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-6 py-6">
              <div className="relative">
                {isListening && (
                  <div className="absolute inset-0 bg-orange-600 rounded-full animate-ping opacity-20 scale-[1.6]"></div>
                )}
                <button 
                  onMouseDown={startListening}
                  onMouseUp={stopListening}
                  onTouchStart={startListening}
                  onTouchEnd={stopListening}
                  disabled={isProcessing}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl relative z-10 disabled:opacity-30 ${isListening ? 'bg-orange-600 scale-110 shadow-orange-600/50' : 'bg-white text-black hover:scale-105 active:scale-90'}`}
                >
                  <svg className={`w-10 h-10 ${isListening ? 'animate-pulse' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </button>
              </div>

              <div className="text-center">
                <p className={`text-[10px] font-black uppercase tracking-[0.4em] mb-2 transition-colors ${isListening ? 'text-orange-500' : 'text-zinc-600'}`}>
                  {isListening ? "Haan, Bolo..." : "HOLD BUTTON TO TALK"}
                </p>
                {error && (
                  <p className="text-orange-500 text-[10px] font-bold px-4 py-2 bg-orange-500/10 rounded-full border border-orange-500/20">{error}</p>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      <footer className="w-full flex justify-center items-center py-6 opacity-30 mt-auto">
        <span className="text-[10px] font-black uppercase tracking-[0.6em]">Chirag Tankan 2025</span>
      </footer>
    </div>
  );
};

export default App;
