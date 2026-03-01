import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import { 
  Printer, 
  Download, 
  Share2, 
  Plus, 
  Car, 
  User, 
  MapPin, 
  FileText, 
  Eye, 
  Smartphone,
  ChevronRight,
  Upload,
  X,
  Mail,
  Globe,
  Phone,
  Calendar,
  Lock,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { usePWAInstall } from './hooks/usePWAInstall';
import { InvoiceData, INITIAL_DATA, VEHICLE_TYPES } from './types';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [data, setData] = useState<InvoiceData>(() => {
    const savedCompany = localStorage.getItem('companyDetails');
    if (savedCompany) {
      const company = JSON.parse(savedCompany);
      return { ...INITIAL_DATA, company };
    }
    return INITIAL_DATA;
  });
  const [showPreview, setShowPreview] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(() => {
    return localStorage.getItem('companyLogo');
  });
  const [previewScale, setPreviewScale] = useState(1);
  const [invoiceHeight, setInvoiceHeight] = useState(0);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { isInstallable, install } = usePWAInstall();

  useEffect(() => {
    document.title = "TrustyYellowCabs Invoice";
  }, []);

  useEffect(() => {
    localStorage.setItem('companyDetails', JSON.stringify(data.company));
  }, [data.company]);

  useEffect(() => {
    if (logoPreview) {
      localStorage.setItem('companyLogo', logoPreview);
    } else {
      localStorage.removeItem('companyLogo');
    }
  }, [logoPreview]);

  useEffect(() => {
    const updateScale = () => {
      if (window.innerWidth < 768) {
        // 210mm is approx 794px. We want to fit this into (window.innerWidth - 32px padding)
        const scale = (window.innerWidth - 32) / 794;
        setPreviewScale(scale);
        if (invoiceRef.current) {
          setInvoiceHeight(invoiceRef.current.offsetHeight);
        }
      } else {
        setPreviewScale(1);
        setInvoiceHeight(0);
      }
    };

    if (showPreview) {
      // Small delay to ensure the DOM is updated
      const timer = setTimeout(updateScale, 100);
      window.addEventListener('resize', updateScale);
      
      // Also observe the invoice element for height changes
      const observer = new ResizeObserver(updateScale);
      if (invoiceRef.current) observer.observe(invoiceRef.current);

      return () => {
        window.removeEventListener('resize', updateScale);
        clearTimeout(timer);
        observer.disconnect();
      };
    }
  }, [showPreview, data]);

  const calculateTotal = () => {
    const { fare } = data;
    const tripAmount = fare.distance * fare.ratePerKm;
    const hourlyAmount = fare.hours * fare.ratePerHour;
    const extraKmsAmount = fare.extraKms * fare.extraKmsRate;
    const waitingCharge = fare.waitingMinutes * fare.waitingRate;
    
    const grandTotal = 
      fare.baseFare +
      tripAmount + 
      hourlyAmount +
      extraKmsAmount +
      waitingCharge + 
      fare.toll + 
      fare.permit + 
      fare.driverBata + 
      fare.peakCharge + 
      fare.extraCharges +
      fare.surcharge +
      fare.dayRent +
      fare.hillsCharge;

    const balance = grandTotal - fare.advancePaid;
    
    return {
      grandTotal,
      advance: fare.advancePaid,
      balance: Math.max(0, balance)
    };
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Logo size should be less than 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setData(prev => ({ ...prev, company: { ...prev.company, logo: base64 } }));
      };
      reader.readAsDataURL(file);
    }
  };

  const downloadPDF = async () => {
    if (!invoiceRef.current || isGenerating) return;
    setIsGenerating(true);
    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const canvas = await html2canvas(invoiceRef.current, { 
        scale: 3, 
        useCORS: true,
        logging: false,
        allowTaint: true,
        windowWidth: 1000,
        onclone: (clonedDoc) => {
          const invoice = clonedDoc.querySelector('.print-invoice') as HTMLElement;
          if (invoice) {
            // Force all colors to be hex/rgb to avoid oklch issues in html2canvas
            const allElements = invoice.querySelectorAll('*');
            allElements.forEach((el) => {
              if (el instanceof HTMLElement) {
                const style = window.getComputedStyle(el);
                el.style.color = style.color;
                el.style.backgroundColor = style.backgroundColor;
                el.style.borderColor = style.borderColor;
                // Fix for uneven text
                el.style.fontVariantLigatures = 'none';
                el.style.textRendering = 'geometricPrecision';
              }

              // Special handling for SVGs (icons) to ensure visibility in html2canvas
              if (el instanceof SVGElement) {
                const style = window.getComputedStyle(el);
                const stroke = style.stroke !== 'none' ? style.stroke : '';
                const fill = style.fill !== 'none' ? style.fill : '';
                
                if (stroke) el.setAttribute('stroke', stroke);
                if (fill) el.setAttribute('fill', fill);
                
                // Ensure dimensions are explicit
                const rect = el.getBoundingClientRect();
                if (rect.width) el.setAttribute('width', rect.width.toString());
                if (rect.height) el.setAttribute('height', rect.height.toString());
              }
            });

            const parent = invoice.parentElement;
            if (parent) {
              parent.style.transform = 'none';
              parent.style.width = '210mm';
              parent.style.display = 'block';
            }
            let current: HTMLElement | null = invoice;
            while (current && current !== clonedDoc.body) {
              current.style.display = 'block';
              current.style.visibility = 'visible';
              current.style.opacity = '1';
              current = current.parentElement;
            }
            clonedDoc.body.style.overflow = 'visible';
          }
        }
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      if (isMobile) {
        // For mobile, we use a blob and a direct download link which is more reliable across all mobile browsers
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Invoice-${data.invoice.number}.pdf`;
        document.body.appendChild(link);
        link.click();
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
      } else {
        pdf.save(`Invoice-${data.invoice.number}.pdf`);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again or use the Print option.');
    } finally {
      setIsGenerating(false);
    }
  };

  const shareWhatsApp = async () => {
    if (!invoiceRef.current || isGenerating) return;
    setIsGenerating(true);

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const canvas = await html2canvas(invoiceRef.current, { 
        scale: 3, 
        useCORS: true,
        logging: false,
        allowTaint: true,
        windowWidth: 1000,
        onclone: (clonedDoc) => {
          const invoice = clonedDoc.querySelector('.print-invoice') as HTMLElement;
          if (invoice) {
            // Force all colors to be hex/rgb to avoid oklch issues in html2canvas
            const allElements = invoice.querySelectorAll('*');
            allElements.forEach((el) => {
              if (el instanceof HTMLElement) {
                const style = window.getComputedStyle(el);
                el.style.color = style.color;
                el.style.backgroundColor = style.backgroundColor;
                el.style.borderColor = style.borderColor;
                // Fix for uneven text
                el.style.fontVariantLigatures = 'none';
                el.style.textRendering = 'geometricPrecision';
              }

              // Special handling for SVGs (icons) to ensure visibility in html2canvas
              if (el instanceof SVGElement) {
                const style = window.getComputedStyle(el);
                const stroke = style.stroke !== 'none' ? style.stroke : '';
                const fill = style.fill !== 'none' ? style.fill : '';
                
                if (stroke) el.setAttribute('stroke', stroke);
                if (fill) el.setAttribute('fill', fill);
                
                // Ensure dimensions are explicit
                const rect = el.getBoundingClientRect();
                if (rect.width) el.setAttribute('width', rect.width.toString());
                if (rect.height) el.setAttribute('height', rect.height.toString());
              }
            });

            const parent = invoice.parentElement;
            if (parent) {
              parent.style.transform = 'none';
              parent.style.width = '210mm';
              parent.style.display = 'block';
            }
            let current: HTMLElement | null = invoice;
            while (current && current !== clonedDoc.body) {
              current.style.display = 'block';
              current.style.visibility = 'visible';
              current.style.opacity = '1';
              current = current.parentElement;
            }
            clonedDoc.body.style.overflow = 'visible';
          }
        }
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      const pdfBlob = pdf.output('blob');
      const fileName = `Invoice-${data.invoice.number}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Taxi Invoice: ${data.invoice.number}`,
        });
      } else {
        // Fallback: Download and notify
        pdf.save(fileName);
        alert('Sharing files is not supported on this browser. The PDF has been downloaded instead. You can now share it manually.');
      }
    } catch (err) {
      console.error('Error sharing:', err);
      alert('Failed to share PDF. It might be due to browser restrictions.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const handleBeforePrint = () => {
      document.title = `Invoice-${data.invoice.number}`;
    };
    const handleAfterPrint = () => {
      document.title = "TrustyYellowCabs Invoice";
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [data.invoice.number]);

  const printInvoice = () => {
    document.title = `Invoice-${data.invoice.number}`;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setTimeout(() => {
      window.print();
    }, isMobile ? 500 : 100);
  };

  const resetData = () => {
    if (confirm("Are you sure you want to clear all data and start a new bill?")) {
      setData(prev => ({
        ...INITIAL_DATA,
        company: prev.company,
        invoice: {
          number: `INV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
          date: new Date().toISOString().split('T')[0],
        }
      }));
      // Keep logoPreview as it is since it's part of company details
      setShowPreview(false);
    }
  };

  const updateField = (section: keyof InvoiceData, field: string, value: any) => {
    setData(prev => ({
      ...prev,
      [section]: typeof prev[section] === 'object' 
        ? { ...(prev[section] as object), [field]: value }
        : value
    }));
  };

  const updateFare = (field: keyof InvoiceData['fare'], value: string) => {
    const numValue = parseFloat(value) || 0;
    setData(prev => ({
      ...prev,
      fare: { ...prev.fare, [field]: numValue }
    }));
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (password === 'trusty123') {
      setIsLoggedIn(true);
      localStorage.setItem('isLoggedIn', 'true');
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('isLoggedIn');
    setPassword('');
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-3xl shadow-xl border border-black/5 w-full max-w-md"
        >
          <div className="flex flex-col items-center gap-4 mb-8">
          
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">TrustyYellowCabs Invoice</h1>
              <p className="text-sm text-black/40 font-medium">Please enter your password to continue</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-black/20">
                <Lock size={18} />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password"
                className={`w-full bg-[#F9F9F9] border-2 rounded-2xl pl-12 pr-4 py-4 outline-none transition-all ${loginError ? 'border-red-500/50 focus:border-red-500' : 'border-transparent focus:border-black/5'}`}
                autoFocus
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-xs font-bold text-center uppercase tracking-wider">Incorrect Password</p>
            )}
            <button 
              type="submit"
              className="w-full bg-black text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black/80 transition-all shadow-lg shadow-black/10"
            >
              Login
              <ChevronRight size={18} />
            </button>
          </form>
          
        <p className="mt-4 text-center text-[9px] font-bold text-black/30 uppercase tracking-widest">
  Secure Billing – TrustyYellowCabs
</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans pb-24">
      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 px-6 py-3 flex items-center justify-around z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] no-print">
        <button 
          onClick={() => setShowPreview(false)}
          className={`flex flex-col items-center gap-1 transition-colors ${!showPreview ? 'text-black' : 'text-black/30'}`}
        >
          <FileText size={20} strokeWidth={!showPreview ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Edit</span>
        </button>
        <button 
          onClick={() => setShowPreview(true)}
          className={`flex flex-col items-center gap-1 transition-colors ${showPreview ? 'text-black' : 'text-black/30'}`}
        >
          <Eye size={20} strokeWidth={showPreview ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Preview</span>
        </button>
        <button 
          onClick={resetData}
          className="flex flex-col items-center gap-1 text-black/30 active:text-black transition-colors"
        >
          <Plus size={20} />
          <span className="text-[10px] font-bold uppercase tracking-wider">New</span>
        </button>
        {showPreview && (
          <button 
            onClick={shareWhatsApp}
            className="flex flex-col items-center gap-1 text-black/30 active:text-black transition-colors"
          >
            <Share2 size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Share</span>
          </button>
        )}
      </nav>

      {/* Header */}
      <header className={`bg-white border-b border-black/5 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-sm no-print ${showPreview ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center gap-2">
        
          <h1 className="font-bold text-lg tracking-tight">TRUSTY - INVOICE</h1>
        </div>
        <div className="flex items-center gap-2">
          {isInstallable && (
            <button 
              onClick={install}
              className="flex items-center gap-2 bg-black text-white px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-black/80 transition-colors"
            >
              <Smartphone size={14} />
              <span className="hidden sm:inline">Install App</span>
              <span className="sm:hidden">Install</span>
            </button>
          )}
          <button 
            onClick={() => setShowPreview(!showPreview)}
            className="hidden md:flex items-center gap-2 bg-white border border-black/10 px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-black/5 transition-colors"
          >
            {showPreview ? <FileText size={14} /> : <Eye size={14} />}
            {showPreview ? 'Edit' : 'Preview'}
          </button>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-red-100 transition-colors"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className={`max-w-4xl mx-auto ${showPreview ? 'p-0 md:p-6' : 'p-4 md:p-6'}`}>
        <AnimatePresence mode="wait">
          {!showPreview ? (
            <motion.div 
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Company & Logo */}
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-black rounded-full" />
                  <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Company Details</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Company Name</label>
                      <input 
                        type="text" 
                        value={data.company.name}
                        onChange={(e) => updateField('company', 'name', e.target.value)}
                        placeholder=""
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black/5 transition-all outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Address</label>
                      <input 
                        type="text" 
                        value={data.company.address}
                        onChange={(e) => updateField('company', 'address', e.target.value)}
                        placeholder=""
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black/5 transition-all outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Custom Info (GST, etc.)</label>
                      <input 
                        type="text" 
                        value={data.company.customInfo}
                        onChange={(e) => updateField('company', 'customInfo', e.target.value)}
                        placeholder="e.g. GSTIN: 27AAAAA0000A1Z5"
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black/5 transition-all outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Phone</label>
                        <input 
                          type="text" 
                          value={data.company.phone}
                          onChange={(e) => updateField('company', 'phone', e.target.value)}
                          placeholder="+91 XXXXXXXXXX"
                          className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Email</label>
                        <input 
                          type="email" 
                          value={data.company.email}
                          onChange={(e) => updateField('company', 'email', e.target.value)}
                          placeholder=""
                          className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Website</label>
                      <input 
                        type="text" 
                        value={data.company.website}
                        onChange={(e) => updateField('company', 'website', e.target.value)}
                        placeholder=""
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-black/5 rounded-2xl p-4 bg-[#F9F9F9] relative group">
                    {logoPreview ? (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <img src={logoPreview} alt="Logo" className="max-h-40 max-w-full object-contain" referrerPolicy="no-referrer" />
                        <button 
                          onClick={() => { setLogoPreview(null); updateField('company', 'logo', null); }}
                          className="absolute -top-2 -right-2 bg-white shadow-md p-1 rounded-full text-red-500 hover:bg-red-50"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2 py-8">
                        <Upload size={24} className="text-black/20" />
                        <span className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Upload Logo</span>
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              </section>

              {/* Invoice Details */}
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-black rounded-full" />
                  <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Invoice Details</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Invoice Number</label>
                    <input 
                      type="text" 
                      value={data.invoice.number}
                      onChange={(e) => updateField('invoice', 'number', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Invoice Date</label>
                    <input 
                      type="date" 
                      value={data.invoice.date}
                      onChange={(e) => updateField('invoice', 'date', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Passenger & Trip */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 bg-black rounded-full" />
                    <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Passenger</h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Name</label>
                      <input 
                        type="text" 
                        value={data.passenger.name}
                        onChange={(e) => updateField('passenger', 'name', e.target.value.toUpperCase())}
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Phone</label>
                      <input 
                        type="tel" 
                        value={data.passenger.phone}
                        onChange={(e) => updateField('passenger', 'phone', e.target.value)}
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                      />
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 bg-black rounded-full" />
                    <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Trip Details</h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">From Location</label>
                      <input 
                        type="text" 
                        value={data.trip.pickup}
                        onChange={(e) => updateField('trip', 'pickup', e.target.value.toUpperCase())}
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">To Location</label>
                      <input 
                        type="text" 
                        value={data.trip.drop}
                        onChange={(e) => updateField('trip', 'drop', e.target.value.toUpperCase())}
                        className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* Vehicle & Driver */}
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-black rounded-full" />
                  <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Vehicle & Driver</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Vehicle Type</label>
                    <input 
                      list="vehicle-types"
                      value={data.vehicle.type}
                      onChange={(e) => updateField('vehicle', 'type', e.target.value.toUpperCase())}
                      placeholder="Eg: SEDAN"
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                    <datalist id="vehicle-types">
                      {VEHICLE_TYPES.map(type => <option key={type} value={type} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Vehicle Number</label>
                    <input 
                      type="text" 
                      value={data.vehicle.number}
                      onChange={(e) => updateField('vehicle', 'number', e.target.value.toUpperCase())}
                      placeholder="TN 66 XX XXXX"
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Driver Name</label>
                    <input 
                      type="text" 
                      value={data.driver.name}
                      onChange={(e) => updateField('driver', 'name', e.target.value.toUpperCase())}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Fare Details */}
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-black rounded-full" />
                  <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Fare Details</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Base Fare</label>
                    <input 
                      type="number" 
                      value={data.fare.baseFare || ''}
                      onChange={(e) => updateFare('baseFare', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Distance (KM)</label>
                    <input 
                      type="number" 
                      value={data.fare.distance || ''}
                      onChange={(e) => updateFare('distance', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Rate / KM</label>
                    <input 
                      type="number" 
                      value={data.fare.ratePerKm || ''}
                      onChange={(e) => updateFare('ratePerKm', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Toll & Parking</label>
                    <input 
                      type="number" 
                      value={data.fare.toll || ''}
                      onChange={(e) => updateFare('toll', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Permit Charges</label>
                    <input 
                      type="number" 
                      value={data.fare.permit || ''}
                      onChange={(e) => updateFare('permit', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Driver Bata</label>
                    <input 
                      type="number" 
                      value={data.fare.driverBata || ''}
                      onChange={(e) => updateFare('driverBata', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Waiting (Min)</label>
                    <input 
                      type="number" 
                      value={data.fare.waitingMinutes || ''}
                      onChange={(e) => updateFare('waitingMinutes', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Waiting Rate</label>
                    <input 
                      type="number" 
                      value={data.fare.waitingRate || ''}
                      onChange={(e) => updateFare('waitingRate', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-blue-600/60 mb-1">Advance Paid</label>
                    <input 
                      type="number" 
                      value={data.fare.advancePaid || ''}
                      onChange={(e) => updateFare('advancePaid', e.target.value)}
                      className="w-full bg-white border-none rounded-lg px-4 py-3 outline-none shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Peak Charge</label>
                    <input 
                      type="number" 
                      value={data.fare.peakCharge || ''}
                      onChange={(e) => updateFare('peakCharge', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Extra Charges</label>
                    <input 
                      type="number" 
                      value={data.fare.extraCharges || ''}
                      onChange={(e) => updateFare('extraCharges', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Surcharge</label>
                    <input 
                      type="number" 
                      value={data.fare.surcharge || ''}
                      onChange={(e) => updateFare('surcharge', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Day Rent</label>
                    <input 
                      type="number" 
                      value={data.fare.dayRent || ''}
                      onChange={(e) => updateFare('dayRent', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Hills Charge</label>
                    <input 
                      type="number" 
                      value={data.fare.hillsCharge || ''}
                      onChange={(e) => updateFare('hillsCharge', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-black rounded-full" />
                  <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Hourly & Extra Kms</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Hours</label>
                    <input 
                      type="number" 
                      value={data.fare.hours || ''}
                      onChange={(e) => updateFare('hours', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Rate / Hour</label>
                    <input 
                      type="number" 
                      value={data.fare.ratePerHour || ''}
                      onChange={(e) => updateFare('ratePerHour', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Extra Kms</label>
                    <input 
                      type="number" 
                      value={data.fare.extraKms || ''}
                      onChange={(e) => updateFare('extraKms', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1">Rate / Extra KM</label>
                    <input 
                      type="number" 
                      value={data.fare.extraKmsRate || ''}
                      onChange={(e) => updateFare('extraKmsRate', e.target.value)}
                      className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Notes */}
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 bg-black rounded-full" />
                  <h2 className="font-bold uppercase text-[10px] tracking-widest text-black/50">Notes</h2>
                </div>
                <textarea 
                  value={data.notes}
                  onChange={(e) => updateField('notes', '', e.target.value)}
                  placeholder="Additional terms or notes..."
                  className="w-full bg-[#F9F9F9] border-none rounded-xl px-4 py-3 outline-none min-h-[100px] resize-none"
                />
              </section>

              {/* Summary Bar */}
              <div className="bg-black text-white rounded-2xl p-4 md:p-6 flex items-center justify-center shadow-xl shadow-black/10">
                <button 
                  onClick={() => {
                    setShowPreview(true);
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                  className="w-full md:w-auto bg-white text-black px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/90 transition-all"
                >
                  Generate Invoice
                  <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-0 md:space-y-6 pb-20 md:pb-0"
            >
              {/* Mobile Preview Header */}
              <div className="md:hidden bg-white px-4 py-4 flex items-center justify-between border-b border-black/5 sticky top-0 z-20 no-print">
                <button 
                  onClick={() => setShowPreview(false)}
                  className="flex items-center gap-2 text-black/60 font-bold text-xs uppercase tracking-widest"
                >
                  <X size={16} />
                  Back
                </button>
                <h2 className="font-bold text-sm tracking-tight">Invoice Preview</h2>
                <div className="w-8" />
              </div>

              {/* Actions - Desktop & Mobile */}
              <div className="flex flex-wrap gap-2 justify-center p-4 md:p-0 mb-0 md:mb-6 no-print bg-[#F8F9FA] md:bg-transparent">
                <button onClick={printInvoice} className="bg-white border border-black/10 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-black/5 flex-1 md:flex-none justify-center">
                  <Printer size={16} /> <span className="hidden sm:inline">Print</span>
                </button>
                <button 
                  onClick={downloadPDF} 
                  disabled={isGenerating}
                  className="bg-white border border-black/10 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-black/5 flex-1 md:flex-none justify-center disabled:opacity-50"
                >
                  <Download size={16} className={isGenerating ? 'animate-bounce' : ''} /> 
                  <span className={isGenerating ? 'inline' : 'hidden sm:inline'}>
                    {isGenerating ? 'PDF...' : 'PDF'}
                  </span>
                </button>
                <button 
                  onClick={shareWhatsApp} 
                  disabled={isGenerating}
                  className="bg-[#25D366] text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 flex-1 md:flex-none justify-center disabled:opacity-50"
                >
                  <Share2 size={16} className={isGenerating ? 'animate-pulse' : ''} /> 
                  <span className={isGenerating ? 'inline' : 'hidden sm:inline'}>
                    {isGenerating ? 'Wait...' : 'WhatsApp'}
                  </span>
                </button>
                <button onClick={resetData} className="hidden md:flex bg-black text-white px-4 py-2 rounded-xl text-sm font-semibold items-center gap-2">
                  <Plus size={16} /> New Bill
                </button>
              </div>

              {/* Invoice Template - Matching Reference */}
              <div 
                className="px-4 md:px-4 flex justify-center overflow-hidden bg-[#F8F9FA] py-6 md:py-0 print-container"
                style={{ 
                  height: previewScale < 1 && invoiceHeight > 0 ? `${(invoiceHeight * previewScale) + 40}px` : 'auto' 
                }}
              >
                <div 
                  className="origin-top transition-transform duration-300"
                  style={{ transform: `scale(${previewScale})`, width: '210mm' }}
                >
                  <div 
                    ref={invoiceRef}
                    className="bg-white shadow-2xl mx-auto p-[6mm] w-[210mm] border border-[#F2F2F2] print:shadow-none print:border-none text-[#1A1A1A] print-invoice"
                  >
                {/* Header Section */}
                <div className="grid grid-cols-2 gap-8 mb-3 items-start">
                  <div className="flex items-center gap-4">
                    {logoPreview && (
                      <img src={logoPreview} alt="Logo" className="h-16 w-16 object-contain" referrerPolicy="no-referrer" />
                    )}
                    <div>
                      {data.company.name && <h1 className="text-2xl font-bold tracking-tight text-[#000000]">{data.company.name}</h1>}
                      {data.company.address && <p className="text-sm text-[#4D4D4D] leading-tight mt-1">{data.company.address}</p>}
                      {data.company.customInfo && <p className="text-xs text-[#666666] mt-1 font-medium">{data.company.customInfo}</p>}
                    </div>
                  </div>
                  <div className="text-right space-y-1.5">
                    {data.company.phone && (
                      <div className="flex items-center justify-end gap-2 text-sm font-bold">
                        <Phone size={14} className="text-[#999999]" strokeWidth={2.5} />
                        <span>{data.company.phone}</span>
                      </div>
                    )}
                    {data.company.email && (
                      <div className="flex items-center justify-end gap-2 text-sm font-bold">
                        <Mail size={14} className="text-[#999999]" strokeWidth={2.5} />
                        <span>{data.company.email}</span>
                      </div>
                    )}
                    {data.company.website && (
                      <div className="flex items-center justify-end gap-2 text-sm font-bold">
                        <Globe size={14} className="text-[#999999]" strokeWidth={2.5} />
                        <span>{data.company.website}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-[1px] bg-[#E6E6E6] w-full mb-4" />

                {/* Title and Invoice Info */}
                <div className="grid grid-cols-2 gap-8 mb-3 items-end">
                  <div>
                    <h2 className="text-xl font-bold uppercase tracking-wider text-[#000000]">Taxi Invoice</h2>
                  </div>
                  <div className="text-right">
                    <div className="inline-block text-right">
                      <p className="text-[10px] font-bold text-[#999999] uppercase tracking-[0.1em] mb-1">Invoice Details</p>
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-lg font-bold leading-none">#{data.invoice.number}</p>
                        <div className="flex items-center gap-2 text-sm font-bold text-[#4D4D4D]">
                          <Calendar size={14} className="text-[#B2B2B2]" />
                          <span>{data.invoice.date}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-8 mb-3 items-start">
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#999999] mb-4">Passenger Details</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <User size={16} className="text-[#999999]" />
                        <p className="font-bold">{data.passenger.name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone size={16} className="text-[#999999]" />
                        <p className="font-bold">{data.passenger.phone}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#999999] mb-4">Trip Details</h3>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <MapPin size={16} className="text-[#999999] mt-1" />
                        <div>
                          <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mb-1">From</p>
                          <p className="text-sm font-bold leading-snug">{data.trip.pickup}</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <MapPin size={16} className="text-[#999999] mt-1" />
                        <div>
                          <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mb-1">To</p>
                          <p className="text-sm font-bold leading-snug">{data.trip.drop}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vehicle Info Bar */}
                <div className="bg-[#F8F9FA] rounded-lg p-3 grid grid-cols-2 gap-8 mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mb-1">Vehicle</p>
                    <p className="font-bold">{data.vehicle.type}</p>
                  </div>
                  {!(data.fare.hours > 0 || data.fare.extraKms > 0) && data.fare.distance > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mb-1">Distance</p>
                      <p className="font-bold">{data.fare.distance} Kms</p>
                    </div>
                  )}
                </div>

                {/* Fare Breakdown */}
                <div className="mb-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#999999] mb-3">Fare Breakdown</h3>
                  <div className="space-y-2">
                    {data.fare.baseFare > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Base Fare</p>
                        <p className="font-bold">₹{data.fare.baseFare.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.distance > 0 && data.fare.ratePerKm > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Kms Charge ({data.fare.distance} km × ₹{data.fare.ratePerKm}/km)</p>
                        <p className="font-bold">₹{(data.fare.distance * data.fare.ratePerKm).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.hours > 0 && data.fare.ratePerHour > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Hourly Charge ({data.fare.hours} hrs × ₹{data.fare.ratePerHour}/hr)</p>
                        <p className="font-bold">₹{(data.fare.hours * data.fare.ratePerHour).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.extraKms > 0 && data.fare.extraKmsRate > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Extra Kms Charge ({data.fare.extraKms} km × ₹{data.fare.extraKmsRate}/km)</p>
                        <p className="font-bold">₹{(data.fare.extraKms * data.fare.extraKmsRate).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.toll > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Toll & Parking</p>
                        <p className="font-bold">₹{data.fare.toll.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.permit > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Permit Charges</p>
                        <p className="font-bold">₹{data.fare.permit.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.waitingMinutes > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Waiting Charges</p>
                        <p className="font-bold">₹{(data.fare.waitingMinutes * data.fare.waitingRate).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.driverBata > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Driver Bata</p>
                        <p className="font-bold">₹{data.fare.driverBata.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.peakCharge > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Peak Charge</p>
                        <p className="font-bold">₹{data.fare.peakCharge.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.extraCharges > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Extra Charges</p>
                        <p className="font-bold">₹{data.fare.extraCharges.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.surcharge > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Surcharge</p>
                        <p className="font-bold">₹{data.fare.surcharge.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.dayRent > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Day Rent</p>
                        <p className="font-bold">₹{data.fare.dayRent.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.hillsCharge > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="font-semibold">Hills Charge</p>
                        <p className="font-bold">₹{data.fare.hillsCharge.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between items-center pt-4 border-t border-[#F2F2F2]">
                    <p className="text-lg font-bold">Grand Total</p>
                    <p className="text-xl font-bold">₹{calculateTotal().grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  
                  {data.fare.advancePaid > 0 && (
                  <div className="-mx-[10mm] bg-[#E9F2F5] border-t border-b border-[#E6E6E6] px-[10mm] py-3 flex justify-between items-center">
                      <p className="text-sm font-bold text-[#DC2626]">Advance Paid</p>
                      <p className="text-lg font-bold text-[#DC2626]">- ₹{data.fare.advancePaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  )}

                  <div className="-mx-[10mm] bg-[#E9F2F5] border-t border-b border-[#E6E6E6] px-[10mm] py-3 flex justify-between items-center">
                    <p className="text-lg font-bold">Balance Payable</p>
                    <p className="text-xl font-bold">₹{calculateTotal().balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>

                    {data.notes && (
                      <div className="mb-3">
                        <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mb-1.5">Notes</p>
                        <p className="text-sm text-[#4D4D4D] whitespace-pre-wrap leading-relaxed text-justify">{data.notes}</p>
                      </div>
                    )}

                {/* Footer Info */}
                <div className="grid grid-cols-2 gap-8 mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mb-2">Driver Name</p>
                    <p className="font-bold uppercase">{data.driver.name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mb-2">Vehicle Number</p>
                    <p className="font-bold uppercase">{data.vehicle.number}</p>
                  </div>
                </div>

                {/* Closing Message */}
                <div className="text-center space-y-2">
                  {data.company.name && <p className="text-sm font-semibold text-[#666666]">Thank you for travelling with {data.company.name}!</p>}
                  <p className="text-[10px] font-bold text-[#B2B2B2] uppercase tracking-widest">This is a computer generated invoice.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </main>
    </div>
  );
}
