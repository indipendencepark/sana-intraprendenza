import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, 
  Beer, 
  Users, 
  Wallet, 
  History, 
  Plus, 
  ShoppingCart, 
  TrendingDown,
  Sparkles,
  X,
  Filter,
  Pencil,
  Trash2,
  ClipboardCheck,
  LogOut,
  Lock,
  Mail,
  User as UserIcon,
  Cloud,
  CloudOff,
  Settings
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc, collection, query, where, getDocs, Firestore } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

// --- CONFIGURAZIONE FISSA (Spostata fuori) ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAj5Ya9w0YTHCU0ZGexD1SVcjlSPTVe5Uo",
  authDomain: "sana-intraprendenza.firebaseapp.com",
  projectId: "sana-intraprendenza",
  storageBucket: "sana-intraprendenza.firebasestorage.app",
  messagingSenderId: "1087913630556",
  appId: "1:1087913630556:web:e4969c289f94023f98bf99",
  measurementId: "G-ZVSB4JDVBC"
};

// Inizializza Firebase globalmente
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app); // Attiva Auth

// --- Types ---

enum UserRole {
  SOCIO = 'SOCIO',
  GUEST = 'GUEST'
}

interface User {
  id: string;
  name: string;
  role: UserRole;
}

// Auth Types
interface RegisteredAccount {
  email: string;
  password: string; // In a real app, this would be hashed. Local storage is cleartext.
  linkedSocioId: string; // ID of the socio (e.g., 'u1')
  name: string;
}

interface Product {
  id: string;
  name: string;
  costPrice: number; // Costo acquisto
  sellPrice: number; // Prezzo vendita
  stock: number;
  category: string;
}

interface TabItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  timestamp: number;
}

interface Tab {
  userId: string; // Per i soci è l'ID, per gli ospiti è 'guest_nome'
  userName: string;
  items: TabItem[];
  totalOwed: number;
}

enum TransactionType {
  SALE_CASH = 'VENDITA_CASSA',
  SALE_TAB = 'VENDITA_BOLLO',
  RESTOCK = 'RIFORNIMENTO',
  EXPENSE = 'SPESA_EXTRA',
  CASH_COUNT = 'CONTEGGIO_CASSA',
  TAB_PAYMENT = 'PAGAMENTO_BOLLO',
  INVENTORY_ADJUSTMENT = 'RETTIFICA_INVENTARIO',
  LOG_MODIFICATION = 'LOG_MODIFICATION'
}

interface LogEntry {
  id: string;
  timestamp: number;
  user: string; // Chi ha fatto l'azione
  type: TransactionType;
  description: string;
  value: number; // Valore monetario positivo o negativo
  meta?: Record<string, any>;
  locked?: boolean;
}

interface CashState {
  currentBalance: number;
  lastVerifiedDate: number;
}

interface AppDataState {
  products: Product[];
  tabs: Tab[];
  cashRegister: CashState;
  logs: LogEntry[];
  cumulativeSales: number;
  cumulativeExpenses: number;
  lastAuditDiscrepancy: number;
}

// --- Mock Data & Constants ---

const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'CALEF', role: UserRole.SOCIO },
  { id: 'u2', name: 'CICO', role: UserRole.SOCIO },
  { id: 'u3', name: 'FRANCO', role: UserRole.SOCIO },
  { id: 'u4', name: 'GELSO', role: UserRole.SOCIO },
  { id: 'u5', name: 'ELIO', role: UserRole.SOCIO },
  { id: 'u6', name: 'LUCA', role: UserRole.SOCIO },
  { id: 'u7', name: 'FELICE', role: UserRole.SOCIO },
  { id: 'u8', name: 'SAVINO', role: UserRole.SOCIO },
  { id: 'u9', name: 'PAOLO', role: UserRole.SOCIO },
];

const INITIAL_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Thè', stock: 28, sellPrice: 1.00, costPrice: 0.36, category: 'Bibite' },
  { id: 'p2', name: 'Fanta', stock: 7, sellPrice: 1.50, costPrice: 0.68, category: 'Bibite' },
  { id: 'p3', name: 'Peroni', stock: 7, sellPrice: 1.50, costPrice: 0.63, category: 'Birre' },
  { id: 'p4', name: 'Patatina', stock: 1, sellPrice: 1.00, costPrice: 0.91, category: 'Snack' },
  { id: 'p5', name: 'Tuc', stock: 15, sellPrice: 1.00, costPrice: 0.40, category: 'Snack' },
  { id: 'p6', name: 'Ringo vaniglia', stock: 7, sellPrice: 1.00, costPrice: 0.42, category: 'Dolci' },
  { id: 'p7', name: 'Baiocchi pistacchio', stock: 15, sellPrice: 0.60, costPrice: 0.34, category: 'Dolci' },
];

const INITIAL_CASH_START = 312.00;

// --- Helper Components ---

const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = "", title }) => (
  <div className={`bg-brand-card rounded-xl p-4 border border-brand-light/10 shadow-sm ${className}`}>
    {title && <h3 className="text-brand-muted text-sm font-medium mb-2 uppercase tracking-wider">{title}</h3>}
    {children}
  </div>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' }> = 
  ({ children, className = "", variant = 'primary', ...props }) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-brand-light text-brand-dark hover:bg-white shadow-lg shadow-brand-light/10 font-bold",
    secondary: "bg-brand-input text-brand-light border border-brand-light/20 hover:bg-brand-card",
    danger: "bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-500/20",
    success: "bg-emerald-800/50 hover:bg-emerald-800 text-emerald-100 border border-emerald-500/30",
    ghost: "text-brand-muted hover:text-brand-light hover:bg-brand-card"
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
};

const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = "bg-brand-input text-brand-muted" }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{children}</span>
);

const formatCurrency = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

// --- Auth Component ---

const AuthScreen = ({ onLogin, db, onOpenCloudConfig }: { onLogin: (userId: string) => void, db: Firestore | null, onOpenCloudConfig: () => void }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedSocio, setSelectedSocio] = useState(INITIAL_USERS[0].id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (db) {
        // --- CLOUD AUTH (FIRESTORE) ---
        const emailKey = email.toLowerCase().trim();
        
        if (mode === 'LOGIN') {
          const userDoc = await getDoc(doc(db, "bar_users", emailKey));
          if (userDoc.exists() && userDoc.data().password === password) {
             onLogin(userDoc.data().linkedSocioId);
          } else {
             setError("Email o password non validi (Cloud).");
          }
        } else {
          // Register
          if (!email || !password) throw new Error('Compila tutti i campi.');
          
          // Check if email exists
          const userDoc = await getDoc(doc(db, "bar_users", emailKey));
          if (userDoc.exists()) throw new Error('Email già registrata.');

          // Check if socio taken
          const q = query(collection(db, "bar_users"), where("linkedSocioId", "==", selectedSocio));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
             throw new Error(`Il socio ${INITIAL_USERS.find(u => u.id === selectedSocio)?.name} è già assegnato a un altro utente.`);
          }

          const socioName = INITIAL_USERS.find(u => u.id === selectedSocio)?.name || 'Utente';
          const newAccount: RegisteredAccount = {
            email: emailKey,
            password,
            linkedSocioId: selectedSocio,
            name: socioName
          };

          await setDoc(doc(db, "bar_users", emailKey), newAccount);
          onLogin(selectedSocio);
        }

      } else {
        // --- LOCAL STORAGE AUTH ---
        const storedAccounts = JSON.parse(localStorage.getItem('bar_accounts') || '[]');
        
        if (mode === 'LOGIN') {
          const account = storedAccounts.find((acc: RegisteredAccount) => acc.email === email && acc.password === password);
          if (account) {
            onLogin(account.linkedSocioId);
          } else {
            setError('Email o password non validi (Locale).');
          }
        } else {
          if (!email || !password) throw new Error('Compila tutti i campi.');
          
          const exists = storedAccounts.find((acc: RegisteredAccount) => acc.email === email);
          if (exists) throw new Error('Email già registrata.');

          const socioTaken = storedAccounts.find((acc: RegisteredAccount) => acc.linkedSocioId === selectedSocio);
          if (socioTaken) throw new Error(`Il socio ${socioTaken.name} è già registrato localmente.`);

          const socioName = INITIAL_USERS.find(u => u.id === selectedSocio)?.name || 'Utente';
          const newAccount: RegisteredAccount = { email, password, linkedSocioId: selectedSocio, name: socioName };

          localStorage.setItem('bar_accounts', JSON.stringify([...storedAccounts, newAccount]));
          onLogin(selectedSocio);
        }
      }
    } catch (err: any) {
      setError(err.message || "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleEmail = result.user.email?.toLowerCase();

      if (!googleEmail) throw new Error("Email non trovata.");

      // Controlla se questa email è associata a un socio nel TUO database
      // Nota: 'db' è ora globale o passato come prop, assicurati che sia accessibile
      const userDocRef = doc(db, "bar_users", googleEmail);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        // L'utente esiste già -> Login
        onLogin(userDocSnap.data().linkedSocioId);
      } else {
        // L'utente non esiste -> Lo pre-compiliamo nel form di registrazione
        setMode('REGISTER');
        setEmail(googleEmail);
        setPassword('google-auth-user'); // Password dummy, tanto usano Google
        alert(`Ciao! L'email ${googleEmail} non è ancora registrata. Seleziona chi sei dal menu "CHI SEI?" e clicca Registrati.`);
      }
    } catch (err: any) {
      console.error(err);
      setError("Errore login Google: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-brand-card p-8 rounded-2xl border border-brand-light/10 shadow-2xl relative">

        <div className="text-center mb-8">
           <h1 className="font-black text-3xl tracking-tighter text-brand-light italic mb-2">Sana Intraprendenza</h1>
           <p className="text-brand-muted text-sm flex justify-center items-center gap-2">
             Gestionale Mini Bar
             {db && <span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">CLOUD ON</span>}
           </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="text-xs text-brand-muted font-bold ml-1 mb-1 block">EMAIL</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-brand-muted" />
              <input 
                type="email" 
                required
                className="w-full bg-brand-input border border-brand-light/20 rounded-lg py-3 pl-10 pr-4 text-brand-light focus:border-brand-light outline-none"
                placeholder="nome@esempio.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-brand-muted font-bold ml-1 mb-1 block">PASSWORD</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-brand-muted" />
              <input 
                type="password" 
                required
                className="w-full bg-brand-input border border-brand-light/20 rounded-lg py-3 pl-10 pr-4 text-brand-light focus:border-brand-light outline-none"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          {mode === 'REGISTER' && (
            <div className="animate-in slide-in-from-top-2">
              <label className="text-xs text-brand-muted font-bold ml-1 mb-1 block">CHI SEI?</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 w-5 h-5 text-brand-muted" />
                <select 
                  className="w-full bg-brand-input border border-brand-light/20 rounded-lg py-3 pl-10 pr-4 text-brand-light focus:border-brand-light outline-none appearance-none"
                  value={selectedSocio}
                  onChange={e => setSelectedSocio(e.target.value)}
                >
                  {INITIAL_USERS.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded">{error}</div>}

          <Button className="w-full py-3 text-lg mt-4" disabled={loading}>
            {loading ? 'Attendi...' : (mode === 'LOGIN' ? 'Accedi' : 'Registrati')}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-brand-light/10"></div></div>
            <div className="relative flex justify-center"><span className="px-2 bg-brand-card text-xs text-brand-muted">OPPURE</span></div>
          </div>

          <Button type="button" variant="secondary" className="w-full" onClick={handleGoogleLogin}>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
               <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
            </svg>
            Accedi con Google
          </Button>
        </form>

        <p className="text-center mt-6 text-sm text-brand-muted">
          {mode === 'LOGIN' ? 'Non hai un account?' : 'Hai già un account?'}
          <button 
            className="text-brand-light font-bold ml-1 hover:underline"
            onClick={() => { setMode(mode === 'LOGIN' ? 'REGISTER' : 'LOGIN'); setError(''); }}
          >
            {mode === 'LOGIN' ? 'Registrati' : 'Accedi'}
          </button>
        </p>
      </div>
    </div>
  );
};

// --- Cloud Setup Component ---

const CloudSetup = ({ onClose, onSave }: { onClose: () => void, onSave: (config: any) => void }) => {
  const [configStr, setConfigStr] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    try {
      const config = JSON.parse(configStr);
      if (!config.apiKey || !config.projectId) throw new Error("Configurazione incompleta");
      onSave(config);
      onClose();
    } catch (e) {
      setError("JSON non valido. Copia l'intero oggetto di configurazione da Firebase.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-brand-dark w-full max-w-lg rounded-2xl border border-brand-light/20 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-brand-light/10 flex justify-between items-center">
           <div className="flex items-center gap-2">
             <Cloud className="text-brand-light" />
             <h3 className="font-bold text-brand-light">Configura Cloud Sync</h3>
           </div>
           <button onClick={onClose}><X className="text-brand-muted hover:text-brand-light" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-sm text-brand-muted">
            Per sincronizzare l'app tra 9 amici, crea un progetto gratuito su <a href="https://console.firebase.google.com" target="_blank" className="text-brand-light underline">Firebase Console</a>.
            Crea un database Firestore e incolla qui sotto la configurazione SDK (JSON).
          </p>
          <textarea 
            className="w-full h-40 bg-brand-input border border-brand-light/20 rounded p-2 text-xs font-mono text-brand-light"
            placeholder='{ "apiKey": "...", "authDomain": "...", "projectId": "..." }'
            value={configStr}
            onChange={e => setConfigStr(e.target.value)}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button onClick={handleSave} className="w-full">Salva e Connetti</Button>
          <Button variant="ghost" onClick={() => { localStorage.removeItem('bar_firebase_config'); window.location.reload(); }} className="w-full text-red-400">
            Disconnetti / Reset
          </Button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'pos' | 'tabs' | 'cash' | 'logs'>('dashboard');
  const [currentUser, setCurrentUser] = useState<string>('');
  
  // Cloud State
  const [isCloudConfigOpen, setIsCloudConfigOpen] = useState(false);
  const [firebaseDb, setFirebaseDb] = useState<Firestore | null>(null);
  
  // Data State
  const [data, setData] = useState<AppDataState>({
    products: INITIAL_PRODUCTS,
    tabs: [],
    cashRegister: { currentBalance: INITIAL_CASH_START, lastVerifiedDate: Date.now() },
    logs: [],
    cumulativeSales: 0,
    cumulativeExpenses: 0,
    lastAuditDiscrepancy: 0
  });

  // Check session on load
  useEffect(() => {
    const session = localStorage.getItem('bar_session_user');
    if (session) {
      setCurrentUser(session);
      setIsAuthenticated(true);
    }
  }, []);

// --- HARDCODED CONFIGURATION ---
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAj5Ya9w0YTHCU0ZGexD1SVcjlSPTVe5Uo",
    authDomain: "sana-intraprendenza.firebaseapp.com",
    projectId: "sana-intraprendenza",
    storageBucket: "sana-intraprendenza.firebasestorage.app",
    messagingSenderId: "1087913630556",
    appId: "1:1087913630556:web:e4969c289f94023f98bf99",
    measurementId: "G-ZVSB4JDVBC"
  };

  // Initialize Data Source (CLOUD ONLY)
  useEffect(() => {
    try {
      // Inizializza direttamente con la configurazione fissa
      const app = initializeApp(FIREBASE_CONFIG);
      const db = getFirestore(app);
      setFirebaseDb(db); 

      // Subscribe to real-time updates for APP DATA
      const unsub = onSnapshot(doc(db, "bar_app", "main_state"), (docSnapshot) => {
        if (docSnapshot.exists()) {
          setData(docSnapshot.data() as AppDataState);
        } else {
          // Se è la prima volta in assoluto e il DB è vuoto, crea il documento
          // (Usa setDoc importato da firestore)
          setDoc(doc(db, "bar_app", "main_state"), data); 
        }
      }, (error) => {
        console.error("Cloud Error:", error);
        alert("Errore connessione Cloud: " + error.message);
      });

      return () => unsub();
    } catch (e) {
      console.error("Firebase init failed", e);
      alert("Impossibile connettersi al database.");
    }
  }, []);

  // Persistence Wrapper
  const saveData = (newData: AppDataState) => {
    setData(newData);
    
    // Save to LocalStorage (Always backup locally)
    localStorage.setItem('bar_data_full', JSON.stringify(newData));

    // Save to Cloud (If connected)
    if (firebaseDb) {
      // Use updateDoc to sync
      updateDoc(doc(firebaseDb, "bar_app", "main_state"), { ...newData })
        .catch(err => console.error("Sync failed", err));
    }
  };

  const handleLogin = (userId: string) => {
    localStorage.setItem('bar_session_user', userId);
    setCurrentUser(userId);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('bar_session_user');
    setIsAuthenticated(false);
    setCurrentUser('');
  };

  // --- AI Logic ---
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const runAiAnalysis = async () => {
    setIsAiLoading(true);
    setAiAnalysis(null);
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        setAiAnalysis("Errore: API Key mancante. Impossibile contattare l'intelligenza artificiale.");
        setIsAiLoading(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const summaryData = {
        cashBalance: data.cashRegister.currentBalance,
        outstandingTabs: data.tabs.reduce((acc, t) => acc + t.totalOwed, 0),
        lowStockItems: data.products.filter(p => p.stock < 5).map(p => p.name),
        recentActivity: data.logs.slice(0, 10),
        discrepancy: data.lastAuditDiscrepancy
      };

      const prompt = `
        Sei il gestore AI del bar "Sana Intraprendenza". Analizza questi dati JSON e dammi un breve report in Italiano (max 3 frasi per punto).
        
        Dati: ${JSON.stringify(summaryData)}

        Punti da coprire:
        1. Stato salute finanziaria (Cassa vs Bolli).
        2. Avvisi magazzino (cosa sta finendo).
        3. Anomalie nei conti (Discrepanza rilevata all'ultimo conteggio).
        
        Usa un tono amichevole ma professionale. Usa emoji. Non usare markdown complesso, solo testo semplice.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setAiAnalysis(response.text);
    } catch (error) {
      console.error(error);
      setAiAnalysis("Si è verificato un errore durante l'analisi AI.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- Actions ---

  const addLog = (
    newData: AppDataState,
    type: TransactionType,
    description: string,
    value: number,
    options: { meta?: Record<string, any>, locked?: boolean } = {}
  ) => {
    const user = INITIAL_USERS.find(u => u.id === currentUser)?.name || 'Sconosciuto';
    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      user,
      type,
      description,
      value,
      meta: options.meta,
      locked: options.locked
    };
    return { ...newData, logs: [newLog, ...newData.logs] };
  };

const processSale = (productId: string, targetUserId: string, isCash: boolean, guestName?: string, qty: number = 1) => {
    const product = data.products.find(p => p.id === productId);
    if (!product) return;

    if (product.stock < qty) {
      alert(`Quantità insufficiente! Disponibili solo ${product.stock} pz.`);
      return;
    }

    let newState = { ...data };

    // 1. Update Stock (sottrae la quantità selezionata)
    newState.products = newState.products.map(p => p.id === productId ? { ...p, stock: p.stock - qty } : p);

    // 2. Financials
    const unitPrice = product.sellPrice;
    const totalValue = unitPrice * qty; // Calcola il totale
    const logName = qty > 1 ? `${product.name} (x${qty})` : product.name; // Nome nel log

    newState.cumulativeSales += totalValue;

    if (isCash) {
      // Cash Sale
      newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance + totalValue };
      newState = addLog(
        newState,
        TransactionType.SALE_CASH,
        `Vendita Cassa: ${logName}`,
        totalValue,
        { meta: { productId: product.id, qty, amount: totalValue, mode: 'cash' } }
      );
    } else {
      // Tab Sale
      let finalUserId = targetUserId;
      let finalUserName = '';

      if (targetUserId === 'guest_custom' && guestName) {
        finalUserName = guestName.trim().toUpperCase();
        finalUserId = `guest_${finalUserName.replace(/\s+/g, '_').toLowerCase()}`;
      } else {
        finalUserName = INITIAL_USERS.find(u => u.id === targetUserId)?.name || 'Sconosciuto';
      }

      const existingTab = newState.tabs.find(t => t.userId === finalUserId);
      const newItem: TabItem = {
        id: crypto.randomUUID(),
        productId: product.id,
        productName: logName, // Salva "Peroni (x2)" nel bollo
        price: totalValue,
        timestamp: Date.now()
      };

      if (existingTab) {
        newState.tabs = newState.tabs.map(t => t.userId === finalUserId ? {
          ...t,
          items: [...t.items, newItem],
          totalOwed: t.totalOwed + totalValue
        } : t);
      } else {
        newState.tabs = [...newState.tabs, {
          userId: finalUserId,
          userName: finalUserName,
          items: [newItem],
          totalOwed: totalValue
        }];
      }
      newState = addLog(
        newState,
        TransactionType.SALE_TAB,
        `Bollo ${finalUserName}: ${logName}`,
        totalValue,
        { meta: { productId: product.id, qty, tabUserId: finalUserId, tabItemId: newItem.id, amount: totalValue, userName: finalUserName } }
      );
    }

    saveData(newState);
  };

  const payTab = (userId: string, amount: number) => {
    let newState = { ...data };
    const tabToPay = newState.tabs.find(t => t.userId === userId);
    const userName = tabToPay?.userName || INITIAL_USERS.find(u => u.id === userId)?.name || 'Utente';

    newState.tabs = newState.tabs.map(t => {
      if (t.userId === userId) {
        const remaining = t.totalOwed - amount;
        return { ...t, totalOwed: remaining < 0 ? 0 : remaining };
      }
      return t;
    }).filter(t => t.totalOwed > 0.01);

    newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance + amount };
    newState = addLog(
      newState,
      TransactionType.TAB_PAYMENT,
      `Pagamento Bollo: ${userName}`,
      amount,
      { meta: { userId, amount, userName } }
    );
    
    saveData(newState);
  };

  const addExpense = (amount: number, reason: string) => {
    let newState = { ...data };
    newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance - amount };
    newState.cumulativeExpenses += amount;
    newState = addLog(
      newState,
      TransactionType.EXPENSE,
      `Spesa: ${reason}`,
      -amount,
      { meta: { amount } }
    );
    saveData(newState);
  };

  // --- Inventory & Audit Actions ---

  const handleSaveProduct = (p: Omit<Product, 'id'>, existingId?: string) => {
    let newState = { ...data };
    let costDifference = 0;
    
    if (existingId) {
      // Editing
      const oldProduct = newState.products.find(prod => prod.id === existingId);
      if (oldProduct) {
        const stockDiff = p.stock - oldProduct.stock;
        if (stockDiff > 0) {
           costDifference = stockDiff * p.costPrice;
        }
        newState.products = newState.products.map(prod => prod.id === existingId ? { ...p, id: existingId } : prod);
        if (stockDiff > 0) {
          newState = addLog(
            newState,
            TransactionType.RESTOCK,
            `Modifica/Restock: ${p.name}`,
            -costDifference,
            { meta: { productId: existingId, stockAdded: stockDiff, costImpact: costDifference, isNewProduct: false } }
          );
        }
      }
    } else {
      // Creating New
      const newProduct = { ...p, id: crypto.randomUUID() };
      newState.products = [...newState.products, newProduct];
      costDifference = p.stock * p.costPrice;
      newState = addLog(
        newState,
        TransactionType.RESTOCK,
        `Nuovo Prodotto: ${p.name}`,
        -costDifference,
        { meta: { productId: newProduct.id, stockAdded: p.stock, costImpact: costDifference, isNewProduct: true } }
      );
    }

    if (costDifference > 0) {
      newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance - costDifference };
      newState.cumulativeExpenses += costDifference;
    }

    saveData(newState);
  };

  const deleteProduct = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = data.products.find(prod => prod.id === id);
    if(p) {
      if(window.confirm(`Sei SICURO di voler eliminare l'articolo "${p.name}" dal database?\nQuesta azione è irreversibile.`)) {
        let newState = { ...data };
        newState.products = newState.products.filter(prod => prod.id !== id);
        newState = addLog(
          newState,
          TransactionType.INVENTORY_ADJUSTMENT,
          `Eliminato Articolo: ${p.name}`,
          0,
          { meta: { removedProduct: p } }
        );
        saveData(newState);
      }
    }
  };

  const performAudit = (countedCash: number, countedStock: Record<string, number>) => {
    let newState = { ...data };
    let presumedSalesRevenue = 0;
    let productsUpdatedLog = [];

    // 1. Check Inventory Differences
    newState.products = newState.products.map(p => {
      const realQty = countedStock[p.id] ?? p.stock;
      const diff = p.stock - realQty; 

      if (diff > 0) {
        const revenue = diff * p.sellPrice;
        presumedSalesRevenue += revenue;
        productsUpdatedLog.push(`${p.name} (mancanti ${diff}, +${formatCurrency(revenue)})`);
      } else if (diff < 0) {
        productsUpdatedLog.push(`${p.name} (trovati ${Math.abs(diff)})`);
      }

      return { ...p, stock: realQty };
    });
    
    // 2. Apply Presumed Revenue
    if (presumedSalesRevenue > 0) {
      newState.cumulativeSales += presumedSalesRevenue;
      newState = addLog(
        newState,
        TransactionType.SALE_CASH,
        `Vendite Presunte da Conteggio: ${productsUpdatedLog.join(', ')}`,
        presumedSalesRevenue,
        { meta: { source: 'audit', productsUpdatedLog }, locked: true }
      );
    }

    // 3. Reconcile Cash
    const totalTabs = newState.tabs.reduce((acc, t) => acc + t.totalOwed, 0);
    const theoreticalAssets = INITIAL_CASH_START + (newState.cumulativeSales + presumedSalesRevenue) - newState.cumulativeExpenses;
    const actualAssets = countedCash + totalTabs;

    // Discrepancy
    const newDiscrepancy = actualAssets - theoreticalAssets;
    newState.lastAuditDiscrepancy = newDiscrepancy;

    // Update Cash State
    newState.cashRegister = {
      currentBalance: countedCash,
      lastVerifiedDate: Date.now()
    };

    newState = addLog(
      newState,
      TransactionType.CASH_COUNT,
      `Conteggio Cassa: ${formatCurrency(countedCash)}. Discrepanza gestione rilevata: ${formatCurrency(newDiscrepancy)}`,
      newDiscrepancy,
      { meta: { countedCash, discrepancy: newDiscrepancy }, locked: true }
    );

    saveData(newState);
    alert(`Conteggio completato!\n\nVendite recuperate da magazzino: ${formatCurrency(presumedSalesRevenue)}\n\nDiscrepanza Aggiornata: ${formatCurrency(newDiscrepancy)}`);
  };

    const reverseLogEffects = (log: LogEntry, baseState: AppDataState) => {
    const meta = log.meta || {};
    let newState = { ...baseState };

    switch (log.type) {
      case TransactionType.SALE_CASH: {
        const { productId, qty, amount } = meta;
        if (!productId || !qty || amount === undefined) throw new Error('Dati vendita cassa mancanti.');
        newState.products = newState.products.map(p => p.id === productId ? { ...p, stock: p.stock + qty } : p);
        newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance - amount };
        newState.cumulativeSales = Math.max(0, newState.cumulativeSales - amount);
        return newState;
      }
      case TransactionType.SALE_TAB: {
        const { productId, qty, tabUserId, tabItemId, amount } = meta;
        if (!productId || !qty || !tabUserId || !tabItemId || amount === undefined) throw new Error('Dati bollo incompleti.');
        newState.products = newState.products.map(p => p.id === productId ? { ...p, stock: p.stock + qty } : p);
        newState.cumulativeSales = Math.max(0, newState.cumulativeSales - amount);
        newState.tabs = newState.tabs
          .map(t => {
            if (t.userId !== tabUserId) return t;
            const items = t.items.filter(i => i.id !== tabItemId);
            const removedItem = t.items.find(i => i.id === tabItemId);
            const refunded = removedItem?.price ?? amount;
            const totalOwed = Math.max(0, t.totalOwed - refunded);
            return { ...t, items, totalOwed };
          })
          .filter(t => t.totalOwed > 0.01 || t.items.length > 0 || t.userId !== tabUserId);
        return newState;
      }
      case TransactionType.TAB_PAYMENT: {
        const { userId, amount, userName } = meta;
        if (!userId || amount === undefined) throw new Error('Dati pagamento bollo mancanti.');
        const targetName = userName || INITIAL_USERS.find(u => u.id === userId)?.name || 'Utente';
        const existing = newState.tabs.find(t => t.userId === userId);
        if (existing) {
          newState.tabs = newState.tabs.map(t => t.userId === userId ? { ...t, totalOwed: t.totalOwed + amount } : t);
        } else {
          newState.tabs = [...newState.tabs, { userId, userName: targetName, items: [], totalOwed: amount }];
        }
        newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance - amount };
        return newState;
      }
      case TransactionType.EXPENSE: {
        const { amount } = meta;
        if (amount === undefined) throw new Error('Importo spesa mancante.');
        newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance + amount };
        newState.cumulativeExpenses = Math.max(0, newState.cumulativeExpenses - amount);
        return newState;
      }
      case TransactionType.RESTOCK: {
        const { productId, stockAdded, costImpact, isNewProduct } = meta;
        if (!productId || stockAdded === undefined || costImpact === undefined) throw new Error('Dati restock mancanti.');
        if (isNewProduct) {
          newState.products = newState.products.filter(p => p.id !== productId);
        } else {
          newState.products = newState.products.map(p => p.id === productId ? { ...p, stock: Math.max(0, p.stock - stockAdded) } : p);
        }
        newState.cashRegister = { ...newState.cashRegister, currentBalance: newState.cashRegister.currentBalance + costImpact };
        newState.cumulativeExpenses = Math.max(0, newState.cumulativeExpenses - costImpact);
        return newState;
      }
      case TransactionType.INVENTORY_ADJUSTMENT: {
        const { removedProduct } = meta;
        if (removedProduct) {
          const exists = newState.products.some(p => p.id === removedProduct.id);
          if (!exists) newState.products = [...newState.products, removedProduct];
        }
        return newState;
      }
      default:
        throw new Error('Questa voce di log non è reversibile.');
    }
  };

  const handleLogDeletion = (logId: string) => {
    const log = data.logs.find(l => l.id === logId);
    if (!log) return;
    if (log.locked) {
      alert('Questa voce è protetta e non può essere eliminata.');
      return;
    }

    if (!window.confirm('Eliminare questa azione e annullarne gli effetti?')) return;

    try {
      let newState = reverseLogEffects(log, { ...data });
      newState.logs = newState.logs.filter(l => l.id !== logId);
      newState = addLog(
        newState,
        TransactionType.LOG_MODIFICATION,
        `Azione annullata: ${log.description}`,
        0,
        { meta: { deletedLogId: log.id, originalType: log.type, originalDescription: log.description }, locked: true }
      );
      saveData(newState);
    } catch (error) {
      alert((error as Error).message);
    }
  };
  
  // --- Views ---

  // 1. Dashboard
  const DashboardView = () => {
    const totalTabs = data.tabs.reduce((acc, t) => acc + t.totalOwed, 0);
    const totalInventoryValue = data.products.reduce((acc, p) => acc + (p.stock * p.sellPrice), 0);
    const [isAuditOpen, setIsAuditOpen] = useState(false);

    return (
      <div className="space-y-6 pb-24">
        <header className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-brand-light">Dashboard</h2>
          <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setActiveTab('logs')} className="text-sm px-2">
                <History className="w-4 h-4" />
              </Button>
          </div>
        </header>

        {aiAnalysis && (
           <Card className="bg-brand-card/80 border-brand-light/20 relative">
             <button onClick={() => setAiAnalysis(null)} className="absolute top-2 right-2 text-brand-muted hover:text-brand-light"><X className="w-4 h-4"/></button>
             <div className="flex gap-3">
               <div className="bg-brand-light/10 p-2 rounded-lg h-fit">
                 <Sparkles className="w-6 h-6 text-brand-light" />
               </div>
               <div>
                 <h4 className="font-bold text-brand-light mb-1">Analisi AI</h4>
                 <p className="text-sm text-brand-light/80 whitespace-pre-line leading-relaxed">{aiAnalysis}</p>
               </div>
             </div>
           </Card>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Card title="Saldo Cassa">
            <div className="flex items-center gap-2">
              <Wallet className="text-emerald-400 w-6 h-6" />
              <span className="text-2xl font-bold text-brand-light">{formatCurrency(data.cashRegister.currentBalance)}</span>
            </div>
          </Card>
          <Card title="Totale Bolli">
            <div className="flex items-center gap-2">
              <Users className="text-orange-400 w-6 h-6" />
              <span className="text-2xl font-bold text-brand-light">{formatCurrency(totalTabs)}</span>
            </div>
          </Card>
        </div>

        <Button 
          className="w-full py-4 text-lg" 
          onClick={() => setIsAuditOpen(true)}
        >
          <ClipboardCheck className="w-6 h-6 mr-2" /> Effettua Conteggio / Inventario
        </Button>

        {isAuditOpen && (
          <AuditModal 
            onClose={() => setIsAuditOpen(false)} 
            products={data.products}
            onConfirm={performAudit}
          />
        )}

        <Card title="Controllo Gestione" className={data.lastAuditDiscrepancy < -5 ? 'border-red-500/50 bg-red-900/10' : 'border-emerald-500/50 bg-emerald-900/10'}>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-end">
              <span className="text-brand-muted text-sm">Discrepanza (Ultimo Conteggio)</span>
              <span className={`text-3xl font-bold ${data.lastAuditDiscrepancy < -2 ? 'text-red-400' : 'text-emerald-400'}`}>
                {data.lastAuditDiscrepancy > 0 ? '+' : ''}{formatCurrency(data.lastAuditDiscrepancy)}
              </span>
            </div>
            <div className="text-xs text-brand-muted mt-2">
              Aggiornato il {new Date(data.cashRegister.lastVerifiedDate).toLocaleString()}
            </div>
          </div>
        </Card>

        <Card title="Valore Magazzino (Vendita)">
          <div className="flex items-center gap-2">
            <Beer className="text-brand-light w-6 h-6" />
            <span className="text-xl font-bold text-brand-light">{formatCurrency(totalInventoryValue)}</span>
          </div>
        </Card>
      </div>
    );
  };

// 2. POS / Vendita
  const POSView = () => {
    const [selectedProd, setSelectedProd] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState(1); // NUOVO STATO QUANTITÀ
    const [guestNameInput, setGuestNameInput] = useState('');
    const [isTabSelectionMode, setIsTabSelectionMode] = useState(false);

    // Resetta tutto quando cambia prodotto
    useEffect(() => {
      if (selectedProd) {
        setQuantity(1);
        setIsTabSelectionMode(false);
        setGuestNameInput('');
      }
    }, [selectedProd]);

    const handleQuantityChange = (delta: number) => {
      if (!selectedProd) return;
      const newQty = quantity + delta;
      if (newQty >= 1 && newQty <= selectedProd.stock) {
        setQuantity(newQty);
      }
    };

    return (
      <div className="space-y-4 pb-24">
        <h2 className="text-2xl font-bold text-brand-light mb-4">Nuova Vendita</h2>
        <div className="grid grid-cols-2 gap-3">
          {data.products.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedProd(p); }}
              disabled={p.stock <= 0}
              className={`p-4 rounded-xl border flex flex-col items-start justify-between h-32 transition-all ${
                p.stock <= 0 
                  ? 'bg-brand-input border-brand-card opacity-50 cursor-not-allowed' 
                  : 'bg-brand-card border-brand-light/10 hover:border-brand-light hover:bg-brand-card/80 active:scale-95'
              }`}
            >
              <div className="flex justify-between w-full items-start">
                <span className="font-bold text-left line-clamp-2 text-brand-light">{p.name}</span>
                <span className="text-xs font-mono bg-brand-dark px-1.5 py-0.5 rounded text-brand-muted shrink-0 ml-2">{p.stock}pz</span>
              </div>
              <span className="text-xl font-bold text-brand-light">{formatCurrency(p.sellPrice)}</span>
            </button>
          ))}
        </div>

        {/* Sale Modal */}
        {selectedProd && (
          <div className="fixed inset-0 bg-brand-dark/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-brand-card w-full max-w-sm rounded-2xl border border-brand-light/20 p-6 shadow-2xl mt-10 mb-10">
              
              <div className="text-center mb-6">
                 <h3 className="text-2xl font-bold mb-1 text-brand-light">{selectedProd.name}</h3>
                 
                 {/* PREZZO DINAMICO */}
                 <p className="text-brand-muted text-lg mb-4">
                   {formatCurrency(selectedProd.sellPrice * quantity)}
                 </p>

                 {/* SELETTORE QUANTITÀ */}
                 <div className="flex items-center justify-center gap-4 bg-brand-input p-2 rounded-xl border border-brand-light/10 w-fit mx-auto">
                    <button 
                      onClick={() => handleQuantityChange(-1)}
                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-brand-card hover:bg-brand-light/10 text-brand-light disabled:opacity-30 active:scale-95 transition-all"
                      disabled={quantity <= 1}
                    >
                      <span className="text-xl font-bold">-</span>
                    </button>
                    
                    <span className="text-2xl font-bold text-brand-light w-8 tabular-nums">{quantity}</span>
                    
                    <button 
                      onClick={() => handleQuantityChange(1)}
                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-brand-light text-brand-dark hover:bg-white active:scale-95 transition-all"
                      disabled={quantity >= selectedProd.stock}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                 </div>
                 {quantity >= selectedProd.stock && <p className="text-xs text-red-400 mt-2">Max disponibile raggiunto</p>}
              </div>
              
              {!isTabSelectionMode ? (
                // --- FASE 1: SCELTA TIPO PAGAMENTO ---
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <Button 
                    className="w-full py-5 text-lg justify-center bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" 
                    onClick={() => { processSale(selectedProd.id, currentUser, true, undefined, quantity); setSelectedProd(null); }}
                  >
                    <Wallet className="w-6 h-6" /> Incassa {formatCurrency(selectedProd.sellPrice * quantity)}
                  </Button>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-brand-light/10"></div></div>
                    <div className="relative flex justify-center"><span className="px-2 bg-brand-card text-xs text-brand-muted">OPPURE</span></div>
                  </div>

                  <Button 
                    className="w-full py-5 text-lg justify-center bg-brand-light text-brand-dark hover:bg-white" 
                    onClick={() => setIsTabSelectionMode(true)}
                  >
                    <Users className="w-6 h-6" /> Segna Bollo
                  </Button>
                </div>
              ) : (
                // --- FASE 2: SELEZIONE CHI METTE IL BOLLO ---
                <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setIsTabSelectionMode(false)} className="p-1 hover:bg-brand-light/10 rounded-full text-brand-muted hover:text-brand-light transition-colors">
                      <X className="w-5 h-5" /> 
                    </button>
                    <span className="text-sm font-bold text-brand-muted uppercase">Chi segna {quantity}x ?</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                     {INITIAL_USERS.map(u => (
                       <button
                          key={u.id}
                          onClick={() => { processSale(selectedProd.id, u.id, false, undefined, quantity); setSelectedProd(null); }}
                          className="p-3 text-xs font-bold bg-brand-input rounded-lg border border-brand-light/10 hover:border-brand-light text-brand-light hover:bg-brand-light/10 transition-all truncate shadow-sm"
                       >
                         {u.name}
                       </button>
                     ))}
                  </div>

                  <div className="bg-brand-input p-3 rounded-lg border border-brand-light/10 mt-4">
                    <label className="text-xs text-brand-muted font-bold ml-1 mb-2 block uppercase">Ospite Esterno</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Nome (es. Mario)"
                        className="w-full bg-brand-dark border border-brand-light/10 rounded p-2 text-brand-light focus:border-brand-light outline-none uppercase placeholder:text-brand-muted/50"
                        value={guestNameInput}
                        onChange={(e) => setGuestNameInput(e.target.value)}
                      />
                      <Button 
                        variant="secondary"
                        disabled={!guestNameInput.trim()}
                        onClick={() => {
                           processSale(selectedProd.id, 'guest_custom', false, guestNameInput, quantity); 
                           setSelectedProd(null); 
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              <button 
                onClick={() => setSelectedProd(null)}
                className="mt-8 w-full py-3 text-brand-muted hover:text-red-400 border-t border-brand-light/10 text-sm transition-colors"
              >
                Annulla Vendita
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 3. Tabs / Bolli
  const TabsView = () => {
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState<string>('');

    useEffect(() => {
      if (expandedUser) {
        const t = data.tabs.find(tab => tab.userId === expandedUser);
        if (t) setPayAmount(t.totalOwed.toFixed(2));
      }
    }, [expandedUser, data.tabs]);

    return (
      <div className="space-y-4 pb-24">
        <h2 className="text-2xl font-bold text-brand-light mb-4">Gestione Bolli</h2>
        {data.tabs.length === 0 && <p className="text-brand-muted text-center py-10">Nessun bollo attivo.</p>}
        
        {data.tabs.map(tab => (
          <div key={tab.userId} className="bg-brand-card rounded-xl border border-brand-light/10 overflow-hidden">
            <div 
              className="p-4 flex justify-between items-center cursor-pointer hover:bg-brand-light/5"
              onClick={() => setExpandedUser(expandedUser === tab.userId ? null : tab.userId)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${tab.userId.startsWith('guest') ? 'bg-purple-500/20 text-purple-400' : 'bg-brand-light/20 text-brand-light'}`}>
                  {tab.userName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-brand-light">{tab.userName}</h3>
                  <p className="text-xs text-brand-muted">{tab.items.length} articoli</p>
                </div>
              </div>
              <span className="text-xl font-bold text-brand-light">{formatCurrency(tab.totalOwed)}</span>
            </div>

            {expandedUser === tab.userId && (
              <div className="bg-brand-dark/50 p-4 border-t border-brand-light/10 animate-in slide-in-from-top-2 duration-200">
                <ul className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-2">
                  {tab.items.map(item => (
                    <li key={item.id} className="flex justify-between text-sm text-brand-light/80 border-b border-brand-light/5 pb-1 last:border-0">
                      <span>{item.productName}</span>
                      <div className="flex flex-col items-end">
                         <span>{formatCurrency(item.price)}</span>
                         <span className="text-[10px] text-brand-muted">{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="bg-brand-input p-3 rounded-lg border border-brand-light/10">
                  <label className="text-xs text-brand-muted uppercase font-bold mb-2 block">Pagamento</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      className="flex-1 bg-brand-dark border border-brand-light/10 rounded p-2 text-brand-light outline-none focus:border-brand-light"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Importo..."
                    />
                    <Button 
                       variant="success"
                       onClick={() => {
                         const val = parseFloat(payAmount);
                         if (val > 0) payTab(tab.userId, val);
                       }}
                    >
                      Paga
                    </Button>
                  </div>
                  <button 
                    className="w-full mt-2 text-xs text-brand-light/70 hover:text-brand-light underline text-center"
                    onClick={() => setPayAmount(tab.totalOwed.toFixed(2))}
                  >
                    Imposta importo totale ({formatCurrency(tab.totalOwed)})
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // 4. Cash / Cassa
  const CashView = () => {
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseReason, setExpenseReason] = useState('');

    return (
      <div className="space-y-6 pb-24">
        <h2 className="text-2xl font-bold text-brand-light mb-4">Gestione Cassa</h2>
        
        <Card className="bg-gradient-to-br from-brand-card to-brand-dark border-brand-light/30">
          <div className="text-center py-6">
            <p className="text-brand-light/60 text-sm uppercase tracking-wider mb-2">Saldo Attuale</p>
            <h1 className="text-5xl font-bold text-brand-light tracking-tight">{formatCurrency(data.cashRegister.currentBalance)}</h1>
            <p className="text-xs text-brand-muted mt-4">Ultima verifica: {new Date(data.cashRegister.lastVerifiedDate).toLocaleString()}</p>
          </div>
        </Card>

        <div className="grid gap-6">
          {/* Expenses */}
          <Card title="Registra Spesa (Prelievo)">
            <div className="flex flex-col gap-3">
              <input 
                type="number" 
                placeholder="0.00" 
                className="bg-brand-input border border-brand-light/10 rounded-lg p-3 text-brand-light focus:border-brand-light outline-none"
                value={expenseAmount}
                onChange={e => setExpenseAmount(e.target.value)}
              />
              <input 
                type="text" 
                placeholder="Motivo (es. Ghiaccio, Bicchieri)" 
                className="bg-brand-input border border-brand-light/10 rounded-lg p-3 text-brand-light focus:border-brand-light outline-none"
                value={expenseReason}
                onChange={e => setExpenseReason(e.target.value)}
              />
              <Button 
                variant="danger" 
                disabled={!expenseAmount || !expenseReason}
                onClick={() => {
                  addExpense(parseFloat(expenseAmount), expenseReason);
                  setExpenseAmount('');
                  setExpenseReason('');
                }}
              >
                <TrendingDown className="w-4 h-4" /> Registra Uscita
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  // 5. Inventory
  const InventoryView = () => {
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

    return (
      <div className="space-y-4 pb-24">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-brand-light">Magazzino</h2>
          <Button onClick={() => setEditingProduct({})} className="w-10 h-10 rounded-full p-0 flex items-center justify-center"><Plus className="w-6 h-6" /></Button>
        </div>

        {editingProduct && (
          <ProductForm 
            product={editingProduct} 
            onSave={(p) => { handleSaveProduct(p, editingProduct.id); setEditingProduct(null); }}
            onCancel={() => setEditingProduct(null)} 
          />
        )}

        <div className="space-y-3">
          {data.products.map(p => (
            <div key={p.id} className="bg-brand-card p-4 rounded-xl border border-brand-light/10 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-brand-light">{p.name}</h3>
                <div className="flex gap-2 text-xs mt-1">
                  <Badge color="bg-brand-input text-brand-muted">{p.category}</Badge>
                  <span className="text-brand-muted">Acq: {formatCurrency(p.costPrice)}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-bold text-brand-light">{formatCurrency(p.sellPrice)}</div>
                  <div className={`text-sm font-mono mt-1 ${p.stock < 5 ? 'text-red-400' : 'text-brand-muted'}`}>
                    Stock: {p.stock}
                  </div>
                </div>
                <div className="flex gap-1">
                   <button onClick={() => setEditingProduct(p)} className="p-2 bg-brand-input rounded text-brand-muted hover:text-brand-light"><Pencil className="w-4 h-4"/></button>
                   <button 
                    type="button"
                    onClick={(e) => deleteProduct(p.id, e)} 
                    className="p-2 bg-brand-input rounded text-red-400 hover:text-red-300"
                   >
                    <Trash2 className="w-4 h-4"/>
                   </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 6. Logs
    const LogsView = () => {
    const [typeFilter, setTypeFilter] = useState<TransactionType | 'ALL'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [showFilters, setShowFilters] = useState(false);


    const filteredLogs = useMemo(() => {
      return data.logs.filter(log => {
        if (typeFilter !== 'ALL' && log.type !== typeFilter) return false;
        if (searchTerm && !log.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (startDate && log.timestamp < new Date(startDate).setHours(0, 0, 0, 0)) return false;
        if (endDate && log.timestamp > new Date(endDate).setHours(23, 59, 59, 999)) return false;
        return true;
      });
    }, [data.logs, typeFilter, searchTerm, startDate, endDate]);

    const typeOptions = [
      { value: 'ALL', label: 'Tutti' },
      { value: TransactionType.SALE_CASH, label: 'Vendite cassa' },
      { value: TransactionType.SALE_TAB, label: 'Vendite bollo' },
      { value: TransactionType.TAB_PAYMENT, label: 'Pagamenti bollo' },
      { value: TransactionType.RESTOCK, label: 'Restock / Prodotti' },
      { value: TransactionType.EXPENSE, label: 'Spese' },
      { value: TransactionType.CASH_COUNT, label: 'Conteggi cassa' },
      { value: TransactionType.INVENTORY_ADJUSTMENT, label: 'Rettifiche inventario' },
      { value: TransactionType.LOG_MODIFICATION, label: 'Revisioni log' }
    ];

    return (
      <div className="space-y-4 pb-24">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-brand-light">Registro Attività</h2>
            <Button
              variant="secondary"
              className="text-sm"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              {showFilters ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              {showFilters ? 'Nascondi filtri' : 'Mostra filtri'}
            </Button>
          </div>
          
          {showFilters && (
            <div className="space-y-2">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as TransactionType | 'ALL')}
                className="w-full bg-brand-input border border-brand-light/10 text-sm text-brand-light rounded-lg px-3 py-2"
              >
                {typeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Cerca descrizione"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-brand-input border border-brand-light/10 text-sm text-brand-light rounded-lg px-3 py-2"
              />

              <div className="flex gap-2 flex-wrap">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  placeholder="dal giorno"
                  className="flex-1 min-w-[160px] bg-brand-input border border-brand-light/10 text-sm text-brand-light rounded-lg px-3 py-2"
                />

                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  placeholder="al giorno"
                  className="flex-1 min-w-[160px] bg-brand-input border border-brand-light/10 text-sm text-brand-light rounded-lg px-3 py-2"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {filteredLogs.length === 0 && (
            <div className="text-center text-brand-muted text-sm py-8 border border-dashed border-brand-light/10 rounded-lg">
              Nessun log corrisponde ai filtri selezionati.
            </div>
          )}
          {filteredLogs.map(log => (
            <div key={log.id} className="flex gap-4 border-b border-brand-light/10 pb-3 last:border-0">
              <div className={`w-2 h-full rounded-full self-stretch ${
                log.type === TransactionType.SALE_CASH ? 'bg-emerald-500' :
                log.type === TransactionType.EXPENSE || log.type === TransactionType.RESTOCK ? 'bg-red-500' :
                log.type === TransactionType.SALE_TAB ? 'bg-orange-500' :
                log.type === TransactionType.TAB_PAYMENT ? 'bg-indigo-500' :
                log.type === TransactionType.LOG_MODIFICATION ? 'bg-amber-400' :
                'bg-brand-muted'
              }`}></div>
              <div className="flex-1">
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-brand-light text-sm">{log.description}</span>
                  <span className={`text-sm font-mono ${log.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {log.value !== 0 ? formatCurrency(log.value) : '-'}
                  </span>
                </div>
                <div className="text-xs text-brand-muted mt-1 flex items-center gap-2">
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                  <span>· {log.user}</span>
                  {log.locked && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-300"><Lock className="w-3 h-3" /> Protetto</span>
                  )}
                </div>
                <div className="text-[10px] text-brand-muted uppercase mt-1 font-bold">{log.type.replace('_', ' ')}</div>
                {!log.locked && (
                  <button
                    className="text-xs text-red-400 hover:text-red-300 mt-2 flex items-center gap-1"
                    onClick={() => handleLogDeletion(log.id)}
                  >
                    <Trash2 className="w-4 h-4" /> Annulla azione
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- Auth Check ---
  if (!isAuthenticated) {
    return (
      <>
        <AuthScreen 
          onLogin={handleLogin} 
          db={firebaseDb} 
          onOpenCloudConfig={() => setIsCloudConfigOpen(true)}
        />
        {isCloudConfigOpen && (
          <CloudSetup 
            onClose={() => setIsCloudConfigOpen(false)}
            onSave={(config) => {
              localStorage.setItem('bar_firebase_config', JSON.stringify(config));
              window.location.reload();
            }}
          />
        )}
      </>
    );
  }

  // --- Layout ---
  return (
    <div className="min-h-screen bg-brand-dark text-brand-light max-w-md mx-auto shadow-2xl overflow-hidden relative font-sans">
      
      {/* Top Bar (User Switcher) */}
      <div className="sticky top-0 bg-brand-dark/95 backdrop-blur-md z-40 px-4 py-3 flex justify-between items-center border-b border-brand-light/10">
        <h1 className="font-black text-xl tracking-tighter text-brand-light italic">Sana Intraprendenza</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-brand-light">
             {INITIAL_USERS.find(u => u.id === currentUser)?.name}
          </span>
          <button onClick={handleLogout} className="text-brand-muted hover:text-red-400">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 min-h-[90vh]">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'pos' && <POSView />}
        {activeTab === 'tabs' && <TabsView />}
        {activeTab === 'cash' && <CashView />}
        {activeTab === 'logs' && <LogsView />}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 w-full max-w-md bg-brand-dark border-t border-brand-light/10 pb-safe pt-2 px-2 z-50 flex justify-between items-center">
        <NavButton icon={<LayoutDashboard />} label="Dash" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavButton icon={<ShoppingCart />} label="Vendita" active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} />
        <NavButton icon={<Beer />} label="Magazzino" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        <NavButton icon={<Users />} label="Bolli" active={activeTab === 'tabs'} onClick={() => setActiveTab('tabs')} />
        <NavButton icon={<Wallet />} label="Cassa" active={activeTab === 'cash'} onClick={() => setActiveTab('cash')} />
      </div>

      {isCloudConfigOpen && (
        <CloudSetup 
          onClose={() => setIsCloudConfigOpen(false)}
          onSave={(config) => {
            localStorage.setItem('bar_firebase_config', JSON.stringify(config));
            window.location.reload();
          }}
        />
      )}

    </div>
  );
}

const NavButton = ({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all w-16 ${
      active ? 'text-brand-dark bg-brand-light' : 'text-brand-muted hover:text-brand-light'
    }`}
  >
    {React.cloneElement(icon, { size: 20, strokeWidth: active ? 2.5 : 2 })}
    <span className="text-[10px] mt-1 font-medium">{label}</span>
  </button>
);

// --- Sub Components ---

const ProductForm = ({ product, onSave, onCancel }: { product: Partial<Product>, onSave: (p: any) => void, onCancel: () => void }) => {
  const [formData, setFormData] = useState({
    name: product.name || '',
    costPrice: product.costPrice?.toString() || '',
    sellPrice: product.sellPrice?.toString() || '',
    stock: product.stock?.toString() || '',
    category: product.category || ''
  });

  return (
    <Card className="mb-6 border-brand-light/30">
      <h3 className="font-bold mb-4 text-brand-light">{product.id ? 'Modifica Articolo' : 'Nuovo Articolo'}</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-xs text-brand-muted">Nome</label>
          <input className="w-full bg-brand-input border border-brand-light/20 p-2 rounded text-brand-light placeholder-brand-muted" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
        </div>
        <div>
           <label className="text-xs text-brand-muted">Costo Acquisto</label>
           <input type="number" className="w-full bg-brand-input border border-brand-light/20 p-2 rounded text-brand-light" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: e.target.value})} />
        </div>
        <div>
           <label className="text-xs text-brand-muted">Prezzo Vendita</label>
           <input type="number" className="w-full bg-brand-input border border-brand-light/20 p-2 rounded text-brand-light" value={formData.sellPrice} onChange={e => setFormData({...formData, sellPrice: e.target.value})} />
        </div>
        <div>
           <label className="text-xs text-brand-muted">Stock Attuale</label>
           <input type="number" className="w-full bg-brand-input border border-brand-light/20 p-2 rounded text-brand-light" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
        </div>
        <div>
           <label className="text-xs text-brand-muted">Categoria</label>
           <input className="w-full bg-brand-input border border-brand-light/20 p-2 rounded text-brand-light" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
        </div>
      </div>
      <div className="bg-brand-input p-2 rounded mb-3 text-xs text-brand-muted">
         Nota: Se aumenti lo stock, il costo totale verrà automaticamente sottratto dalla cassa come spesa.
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSave({
          name: formData.name,
          costPrice: parseFloat(formData.costPrice),
          sellPrice: parseFloat(formData.sellPrice),
          stock: parseInt(formData.stock),
          category: formData.category || 'Generico'
        })} className="flex-1">Salva</Button>
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
      </div>
    </Card>
  )
};

const AuditModal = ({ onClose, products, onConfirm }: { onClose: () => void, products: Product[], onConfirm: (cash: number, stock: Record<string, number>) => void }) => {
  const [step, setStep] = useState(1);
  const [actualCash, setActualCash] = useState('');
  const [stockCounts, setStockCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    products.forEach(p => initial[p.id] = p.stock.toString());
    setStockCounts(initial);
  }, [products]);

  const handleConfirm = () => {
    const numericStock: Record<string, number> = {};
    Object.keys(stockCounts).forEach(k => numericStock[k] = parseInt(stockCounts[k] || '0'));
    onConfirm(parseFloat(actualCash), numericStock);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-brand-dark w-full max-w-md rounded-2xl border border-brand-light/20 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-brand-light/10 flex justify-between items-center">
           <h3 className="font-bold text-brand-light">Conteggio & Inventario</h3>
           <button onClick={onClose}><X className="text-brand-muted hover:text-brand-light" /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 ? (
            <div className="space-y-4">
               <div className="text-center">
                  <Wallet className="w-12 h-12 text-brand-light mx-auto mb-3" />
                  <h4 className="text-xl font-bold text-brand-light">Passo 1: Conta la Cassa</h4>
                  <p className="text-brand-muted text-sm mt-2">Apri la cassettina e conta quanti soldi ci sono realmente.</p>
               </div>
               <input 
                  type="number" 
                  autoFocus
                  placeholder="0.00 €" 
                  className="w-full text-center text-3xl bg-brand-input border-2 border-brand-light/30 rounded-xl p-4 text-brand-light focus:border-brand-light outline-none"
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value)}
               />
               <Button className="w-full mt-4" disabled={!actualCash} onClick={() => setStep(2)}>
                 Avanti
               </Button>
            </div>
          ) : (
            <div className="space-y-4">
               <div className="text-center mb-4">
                  <Beer className="w-8 h-8 text-brand-light mx-auto mb-2" />
                  <h4 className="text-lg font-bold text-brand-light">Passo 2: Conta il Magazzino</h4>
                  <p className="text-brand-muted text-xs">Se conti meno prodotti di quelli indicati, la differenza verrà segnata come VENDUTA.</p>
               </div>
               
               <div className="space-y-2">
                 {products.map(p => (
                   <div key={p.id} className="flex items-center justify-between bg-brand-card p-3 rounded-lg border border-brand-light/10">
                      <div className="flex-1">
                        <div className="font-bold text-sm text-brand-light">{p.name}</div>
                        <div className="text-xs text-brand-muted">Sistema: {p.stock}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-brand-muted">Reale:</span>
                        <input 
                          type="number"
                          className="w-16 bg-brand-input border border-brand-light/20 rounded p-1 text-center font-bold text-brand-light"
                          value={stockCounts[p.id] || ''}
                          onChange={e => setStockCounts({...stockCounts, [p.id]: e.target.value})}
                        />
                      </div>
                   </div>
                 ))}
               </div>

               <div className="pt-4 border-t border-brand-light/10 mt-4">
                 <Button variant="success" className="w-full" onClick={handleConfirm}>
                   Conferma & Chiudi Conteggio
                 </Button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
