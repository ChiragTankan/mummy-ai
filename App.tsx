
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Message } from './types';

const getSystemInstruction = (gender: 'boy' | 'girl') => {
  const common = `You are "Maa AI", a traditional, wise, and deeply loving Indian mother.
  Your personality:
  - Language: Use a mix of Hindi and English (Hinglish). Use words like 'Beta', 'Bachcha', 'Laal'.
  - Tone: Very warm but "Softly Strict". You care deeply about health, sleep patterns, and eating habits.
  - Behavior: If the user says they haven't eaten or slept, scold them lovingly (e.g., "Ye kya tarika hai? Health ka dhyan nahi rakhoge toh kaise chalega?").
  - Constraints: Keep responses concise (max 3 sentences). Never break character.`;
  
  if (gender === 'girl') {
    return `${common} You are talking to your daughter (Beti). Ask about her household, if she's resting enough, and her happiness. Be her best friend and mother.`;
  } else {
    return `${common} You are talking to your son (Beta). Encourage him to be responsible, disciplined, and to never skip meals. Be his guide.`;
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
      if (e.error === 'not-allowed') setError("Microphone access denied.");
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    // Attempt to find a warm Hindi female voice
    const hindiVoice = voices.find(v => v.lang.includes('hi') && v.name.includes('Female')) || 
                     voices.find(v => v.lang.includes('hi')) || 
                     voices[0];
    
    if (hindiVoice) utterance.voice = hindiVoice;
    utterance.lang = 'hi-IN';
    utterance.pitch = 1.1;
    utterance.rate = 0.9;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const handleStartSession = async (selectedGender: 'boy' | 'girl') => {
    if (pin !== ACCESS_PIN) {
      setError("Maa: 'Sahi code dalo pehle!' (Hint: 1234)");
      return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("System: API_KEY is missing in Vercel. Please add it to Environment Variables.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-pro-preview',
      config: { 
        systemInstruction: getSystemInstruction(selectedGender),
        temperature: 0.8,
        topP: 0.95
      },
    });

    setGender(selectedGender);
    setIsSessionStarted(true);
    setIsProcessing(true);

    try {
      const response = await chatRef.current.sendMessage({ 
        message: selectedGender === 'girl' ? "Maa, main aa gayi. Greet me." : "Maa, main aa gaya. Greet me." 
      });
      const maaText = response.text;
      setMessages([{ role: 'mummy', text: maaText, timestamp: new Date() }]);
      speak(maaText);
    } catch (err) {
      console.error(err);
      setError("Maa: 'Internet slow hai beta, thoda ruko.'");
    } finally {
      setIsProcessing(false);
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
      setMessages(prev => [...prev, { role: 'mummy', text: maaText, timestamp: new Date() }]);
      speak(maaText);
    } catch (err) {
      setError("Maa: 'Beta, phone ka network check karo.'");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="w-full bg-orange-950/20 py-2 px-4 text-center border-b border-orange-500/10 backdrop-blur-sm">
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-orange-400/80">
          Lovingly Developed by <span className="text-orange-200">Chirag Tankan</span>
        </p>
      </div>

      {!isSessionStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto w-full animate-in fade-in duration-700">
          <div className="mb-8 relative">
            <div className="absolute inset-0 bg-orange-500 rounded-full blur-3xl opacity-10 animate-pulse"></div>
            <div className="w-28 h-28 rounded-full bg-zinc-900 border border-orange-900/30 flex items-center justify-center text-5xl shadow-2xl relative z-10">🤱</div>
          </div>
          
          <h1 className="text-5xl font-black mb-1 bg-gradient-to-b from-orange-100 to-orange-600 bg-clip-text text-transparent tracking-tighter">Maa AI</h1>
          <p className="text-zinc-500 text-[9px] font-bold tracking-[0.5em] uppercase mb-10">Mera Ghar, Meri Maa</p>

          <div className="bg-zinc-900/80 p-6 rounded-[2.5rem] border border-white/5 w-full shadow-2xl backdrop-blur-xl">
            <input 
              type="tel"
              pattern="[0-9]*"
              inputMode="numeric"
              placeholder="Ghar Ka PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-4 py-4 mb-6 text-center text-xl font-bold tracking-widest focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-zinc-600"
            />
            
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => handleStartSession('girl')} 
                className="group p-6 bg-zinc-800/50 hover:bg-orange-600/10 border border-white/5 hover:border-orange-500/40 rounded-3xl transition-all active:scale-95 flex flex-col items-center"
              >
                <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">👩</span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 group-hover:text-orange-200">Beti</span>
              </button>
              <button 
                onClick={() => handleStartSession('boy')} 
                className="group p-6 bg-zinc-800/50 hover:bg-orange-600/10 border border-white/5 hover:border-orange-500/40 rounded-3xl transition-all active:scale-95 flex flex-col items-center"
              >
                <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">👦</span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 group-hover:text-orange-200">Beta</span>
              </button>
            </div>
            {error && <p className="mt-5 text-orange-400 text-[10px] font-bold bg-orange-400/10 p-3 rounded-xl border border-orange-400/20">{error}</p>}
          </div>
          <p className="mt-8 text-zinc-600 text-[8px] uppercase tracking-[0.4em] font-medium">Pin required to protect privacy</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 md:p-6 overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
          <header className="flex items-center gap-4 mb-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${isSpeaking ? 'bg-orange-600 border-orange-300 scale-110 shadow-lg shadow-orange-600/20' : 'bg-zinc-900 border-zinc-800'}`}>
               <span className="text-3xl">{isSpeaking ? '👵' : '🤱'}</span>
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                Maa AI 
                {isProcessing && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>}
              </h1>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">
                Talking to {gender === 'girl' ? 'Beti' : 'Beta'}
              </p>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="p-3 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-500 hover:text-white active:scale-90 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </header>

          <div className="flex-1 bg-zinc-900/40 border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden relative shadow-2xl backdrop-blur-md">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                  <div className={`max-w-[85%] px-5 py-3.5 rounded-[1.5rem] text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-zinc-800/80 text-zinc-200 rounded-tr-none' : 'bg-gradient-to-br from-orange-800 to-orange-950 text-white rounded-tl-none font-medium'}`}>
                    <div className="text-[7px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">
                      {msg.role === 'user' ? (gender === 'girl' ? 'Beti' : 'Beta') : 'Maa'}
                    </div>
                    {msg.text}
                  </div>
                </div>
              ))}
              {liveTranscript && (
                <div className="flex justify-end animate-pulse">
                  <div className="max-w-[85%] px-5 py-3.5 rounded-[1.5rem] text-xs italic bg-zinc-800/30 text-zinc-500 border border-white/5 rounded-tr-none">
                    {liveTranscript}...
                  </div>
                </div>
              )}
            </div>
            
            {isProcessing && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-orange-950/90 backdrop-blur-md px-5 py-2 rounded-full text-[8px] font-black uppercase tracking-[0.3em] text-orange-400 border border-orange-500/20 shadow-2xl animate-bounce">
                Maa Soch Rahi Hai...
              </div>
            )}
          </div>

          <div className="py-8 flex flex-col items-center gap-4">
            <div className="relative">
              {isListening && (
                <div className="absolute inset-0 bg-orange-600 rounded-full animate-ping opacity-20 scale-150"></div>
              )}
              <button 
                onMouseDown={() => recognitionRef.current?.start()}
                onMouseUp={() => recognitionRef.current?.stop()}
                onTouchStart={(e) => { e.preventDefault(); recognitionRef.current?.start(); }}
                onTouchEnd={(e) => { e.preventDefault(); recognitionRef.current?.stop(); }}
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl relative z-10 ${isListening ? 'bg-orange-600 scale-110 shadow-orange-600/50' : 'bg-white text-black hover:scale-105 active:scale-90'}`}
              >
                <svg className={`w-10 h-10 ${isListening ? 'animate-pulse' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </button>
            </div>
            <div className="text-center">
              <p className={`text-[10px] font-black uppercase tracking-[0.4em] transition-colors duration-300 ${isListening ? 'text-orange-500' : 'text-zinc-600'}`}>
                {isListening ? "Haan Beta, Sun Rahi Hoon..." : "Daba kar Rakhein aur Maa se Baat Karein"}
              </p>
              {error && <p className="mt-2 text-orange-500 text-[10px] font-bold">{error}</p>}
            </div>
          </div>
        </div>
      )}
      
      <footer className="w-full text-center py-6 opacity-20 mt-auto">
        <span className="text-[9px] font-black uppercase tracking-[0.8em]">Chirag Tankan &copy; 2025</span>
      </footer>
    </div>
  );
};

export default App;
