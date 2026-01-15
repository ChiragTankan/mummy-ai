
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Message } from './types';

const SYSTEM_INSTRUCTION = `You are "JARVIS" (Just A Rather Very Intelligent System), a highly sophisticated AI assistant.
Your persona:
- Language: English (British). Use a calm, polite, and technical tone.
- Address: Always refer to the user as "Sir".
- Style: Precise, efficient, and slightly witty. 
- IMPORTANT: DO NOT use any markdown formatting. NO asterisks (**), NO hashes (##), NO bullet points with symbols, NO bolding, NO italics.
- Output: Plain text only. Use clear punctuation.
- Functionality: You have access to real-time information via Google Search. When asked for updates or news (especially regarding India), provide the most recent data.
- Response Length: Concise but informative.
- Constraints: Maintain your role as a high-end AI assistant at all times.`;

// Utility to clean up any accidental markdown or special characters that trip up TTS
const cleanTextForTTS = (text: string) => {
  return text
    .replace(/\*\*/g, '') // Remove double asterisks
    .replace(/\*/g, '')   // Remove single asterisks
    .replace(/#/g, '')    // Remove hashes
    .replace(/__/g, '')   // Remove underscores
    .replace(/`/g, '')    // Remove backticks
    .trim();
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [groundingLinks, setGroundingLinks] = useState<{title: string, uri: string}[]>([]);

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
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

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
      console.error("Recognition error:", e);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const cleanedText = cleanTextForTTS(text);
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    const voices = window.speechSynthesis.getVoices();
    
    // JARVIS Priority: British Male -> Any Male -> British -> Any
    const jarvisVoice = voices.find(v => v.lang.includes('en-GB') && (v.name.toLowerCase().includes('male') || v.name.includes('Daniel') || v.name.includes('Arthur'))) || 
                       voices.find(v => v.name.toLowerCase().includes('male') && v.lang.includes('en')) ||
                       voices.find(v => v.lang.includes('en-GB')) || 
                       voices.find(v => v.lang.includes('en')) ||
                       voices[0];
    
    if (jarvisVoice) utterance.voice = jarvisVoice;
    utterance.lang = 'en-GB';
    utterance.pitch = 0.85; 
    utterance.rate = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const handleStartSession = async () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("System Critical: API_KEY deployment required.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.5,
        tools: [{ googleSearch: {} }]
      },
    });

    setIsSessionStarted(true);
    setIsProcessing(true);
    setError(null);

    try {
      const response = await chatRef.current.sendMessage({ 
        message: "System online. Greet me, JARVIS." 
      });
      const rawText = response.text || "";
      const jarvisText = cleanTextForTTS(rawText);
      setMessages([{ role: 'assistant', text: jarvisText, timestamp: new Date() }]);
      speak(jarvisText);
    } catch (err) {
      console.error(err);
      setError("System: Communication uplink failure.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;
    
    setIsProcessing(true);
    setGroundingLinks([]);
    const userMsg: Message = { role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await chatRef.current.sendMessage({ message: text });
      const rawText = response.text || "";
      const jarvisText = cleanTextForTTS(rawText);
      
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const links = chunks
          .filter((c: any) => c.web)
          .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));
        setGroundingLinks(links);
      }

      setMessages(prev => [...prev, { role: 'assistant', text: jarvisText, timestamp: new Date() }]);
      speak(jarvisText);
    } catch (err) {
      console.error(err);
      setError("System: Signal interference detected.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-black text-[#00f2ff]">
      <div className="w-full bg-[#001a2c]/50 py-2 px-4 flex justify-between items-center border-b border-[#00f2ff]/20 backdrop-blur-md z-50">
        <p className="text-[10px] font-mono-tech uppercase tracking-[0.4em] text-[#00f2ff]/60">
          Uplink: <span className="text-[#00f2ff]">Secured</span>
        </p>
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-[#00f2ff] animate-pulse"></div>
           <p className="text-[10px] font-mono-tech uppercase tracking-[0.4em] text-[#00f2ff]/60">
             System: <span className="text-[#00f2ff]">Active</span>
           </p>
        </div>
      </div>

      {!isSessionStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto w-full animate-in fade-in duration-1000">
          <div className="mb-12 relative group cursor-pointer" onClick={handleStartSession}>
            <div className="absolute inset-0 bg-[#00f2ff] rounded-full blur-[100px] opacity-20 animate-pulse group-hover:opacity-40 transition-opacity"></div>
            <div className="w-44 h-44 rounded-full bg-[#000d14] border-4 border-[#00f2ff]/30 flex items-center justify-center shadow-[0_0_60px_rgba(0,242,255,0.3)] relative z-10 overflow-hidden group-hover:border-[#00f2ff]/60 transition-colors">
               <div className="absolute inset-0 border-t-4 border-[#00f2ff] rounded-full animate-spin [animation-duration:3s]"></div>
               <div className="absolute inset-4 border-b-2 border-[#00f2ff]/20 rounded-full animate-spin [animation-duration:5s] [animation-direction:reverse]"></div>
               <span className="text-8xl filter drop-shadow-[0_0_15px_rgba(0,242,255,0.8)] select-none">⎊</span>
            </div>
          </div>
          
          <h1 className="text-6xl font-black mb-1 text-white tracking-tighter filter drop-shadow-[0_0_10px_rgba(0,242,255,0.4)]">J.A.R.V.I.S.</h1>
          <p className="text-[#00f2ff]/60 text-[9px] font-mono-tech tracking-[0.8em] uppercase mb-12">Just A Rather Very Intelligent System</p>

          <div className="bg-[#001a2c]/80 p-8 rounded-[2.5rem] border border-[#00f2ff]/20 w-full shadow-2xl backdrop-blur-xl glow-cyan">
            <button 
              onClick={handleStartSession} 
              className="w-full py-6 bg-[#00f2ff] text-black font-black uppercase tracking-[0.4em] rounded-xl hover:bg-white active:scale-95 transition-all shadow-[0_0_40px_rgba(0,242,255,0.5)] flex items-center justify-center gap-3"
            >
              <span className="text-xl">⎊</span>
              Initialize JARVIS
            </button>
            {error && <p className="mt-6 text-red-500 text-[10px] font-mono-tech uppercase tracking-widest bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 md:p-6 overflow-hidden animate-in fade-in duration-500">
          <header className="flex items-center gap-4 mb-8">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-700 relative ${isSpeaking ? 'border-[#00f2ff] shadow-[0_0_30px_rgba(0,242,255,0.6)]' : 'border-[#00f2ff]/20'}`}>
               {isSpeaking && <div className="absolute inset-0 rounded-full border-2 border-[#00f2ff]/50 animate-ping opacity-30"></div>}
               <span className="text-3xl filter drop-shadow-[0_0_10px_rgba(0,242,255,1)]">⎊</span>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-black tracking-widest text-white uppercase">Neural Matrix</h1>
              <p className="text-[10px] font-mono-tech uppercase tracking-[0.4em] text-[#00f2ff]/50">
                Uplink: <span className="text-[#00f2ff]">{isProcessing ? 'Optimizing' : 'Ready'}</span>
              </p>
            </div>
            <div className="flex gap-2">
              {isSpeaking && (
                <button 
                  onClick={stopSpeaking}
                  className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-all animate-pulse"
                  title="Mute Uplink"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z" />
                  </svg>
                </button>
              )}
              <button 
                onClick={() => window.location.reload()} 
                className="p-3 bg-[#001a2c] border border-[#00f2ff]/20 rounded-lg text-[#00f2ff] hover:bg-[#00f2ff] hover:text-black transition-all"
                title="System Reset"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 bg-[#000d14]/90 border border-[#00f2ff]/10 rounded-[2rem] flex flex-col overflow-hidden relative shadow-2xl backdrop-blur-md">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[90%] px-6 py-4 rounded-xl text-sm leading-relaxed border ${msg.role === 'user' ? 'bg-[#001a2c]/60 border-[#00f2ff]/30 text-[#00f2ff] rounded-tr-none' : 'bg-[#001a2c]/30 border-white/5 text-white rounded-tl-none'}`}>
                    <div className="text-[8px] font-mono-tech uppercase tracking-[0.4em] opacity-30 mb-2">
                      {msg.role === 'user' ? 'SIR' : 'J.A.R.V.I.S.'}
                    </div>
                    {msg.text}
                    {msg.role === 'assistant' && groundingLinks.length > 0 && idx === messages.length - 1 && (
                      <div className="mt-4 pt-4 border-t border-[#00f2ff]/10">
                        <p className="text-[9px] font-mono-tech uppercase tracking-widest text-[#00f2ff]/40 mb-2">Live Data Feed:</p>
                        <div className="flex flex-wrap gap-2">
                          {groundingLinks.slice(0, 3).map((link, i) => (
                            <a key={i} href={link.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#00f2ff] hover:text-white bg-[#00f2ff]/10 px-2 py-1 rounded truncate max-w-[200px] border border-[#00f2ff]/10 transition-all">
                              {link.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {liveTranscript && (
                <div className="flex justify-end animate-pulse">
                  <div className="max-w-[85%] px-5 py-3 rounded-xl text-xs italic bg-black border border-[#00f2ff]/10 text-[#00f2ff]/40">
                    Intercepting: {liveTranscript}...
                  </div>
                </div>
              )}
            </div>
            
            {isProcessing && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#00f2ff] px-6 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.4em] text-black shadow-[0_0_20px_rgba(0,242,255,0.4)] animate-pulse">
                Accessing Satellite Network
              </div>
            )}
          </div>

          <div className="py-10 flex flex-col items-center gap-6">
            <div className="relative group">
              <div className={`absolute inset-0 bg-[#00f2ff] rounded-full blur-[50px] transition-opacity duration-500 ${isListening ? 'opacity-40' : 'opacity-0'}`}></div>
              <button 
                onMouseDown={() => recognitionRef.current?.start()}
                onMouseUp={() => recognitionRef.current?.stop()}
                onTouchStart={(e) => { e.preventDefault(); recognitionRef.current?.start(); }}
                onTouchEnd={(e) => { e.preventDefault(); recognitionRef.current?.stop(); }}
                className={`w-28 h-28 rounded-full border-4 flex items-center justify-center transition-all duration-300 shadow-2xl relative z-10 ${isListening ? 'bg-[#00f2ff] border-white scale-110 shadow-[0_0_60px_rgba(0,242,255,0.8)]' : 'bg-black border-[#00f2ff]/40 text-[#00f2ff] hover:border-[#00f2ff] active:scale-95'}`}
              >
                <div className={`w-full h-full rounded-full flex items-center justify-center ${isListening ? 'text-black' : 'text-[#00f2ff]'}`}>
                  <svg className={`w-12 h-12 ${isListening ? 'animate-pulse' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </div>
              </button>
            </div>
            <div className="text-center">
              <p className={`text-[11px] font-mono-tech uppercase tracking-[0.6em] transition-colors duration-300 ${isListening ? 'text-[#00f2ff] font-bold' : 'text-[#00f2ff]/30'}`}>
                {isListening ? "TRANSMITTING DATA" : "HOLD TO ESTABLISH VOICE UPLINK"}
              </p>
              {error && <p className="mt-4 text-red-500 text-[10px] font-mono-tech uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded border border-red-500/20">{error}</p>}
            </div>
          </div>
        </div>
      )}
      
      <footer className="w-full text-center py-8 opacity-20 mt-auto">
        <span className="text-[10px] font-mono-tech uppercase tracking-[1.5em] text-[#00f2ff]">SECURED INTERFACE BY CHIRAG TANKAN</span>
      </footer>
    </div>
  );
};

export default App;
