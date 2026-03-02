import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import { 
  Printer, 
  Download, 
  Share2, 
  Plus, 
  Car, 
  FileText, 
  Eye, 
  Smartphone,
  ChevronRight,
  Upload,
  X,
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
            // Helper to normalize colors to RGB (fixes oklch/oklab issues in html2canvas)
            const normalizeColor = (color: string) => {
              if (!color || color === 'transparent' || color === 'none' || color.startsWith('rgb')) return color;
              try {
                const tempCanvas = clonedDoc.createElement('canvas');
                tempCanvas.width = 1;
                tempCanvas.height = 1;
                const ctx = tempCanvas.getContext('2d');
                if (!ctx) return color;
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 1, 1);
                const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
                return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
              } catch (e) {
                return color;
              }
            };


            // Force all colors to be hex/rgb to avoid oklch issues in html2canvas
            const allElements = invoice.querySelectorAll('*');
            allElements.forEach((el) => {
              if (el instanceof HTMLElement) {
                const style = window.getComputedStyle(el);
                el.style.color = normalizeColor(style.color);
                el.style.backgroundColor = normalizeColor(style.backgroundColor);
                el.style.borderColor = normalizeColor(style.borderColor);
                // Fix for uneven text
                el.style.fontVariantLigatures = 'none';
                el.style.textRendering = 'geometricPrecision';
                (el.style as any).webkitFontSmoothing = 'antialiased';
              }

              // Special handling for SVGs (icons) to ensure visibility in html2canvas
              if (el instanceof SVGElement) {
                const style = window.getComputedStyle(el);
                const stroke = style.stroke !== 'none' ? style.stroke : '';
                const fill = style.fill !== 'none' ? style.fill : '';
                
                if (stroke) el.setAttribute('stroke', normalizeColor(stroke));
                if (fill) el.setAttribute('fill', normalizeColor(fill));
                
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
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const contentHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let finalWidth = pdfWidth;
      let finalHeight = contentHeight;
      
      if (contentHeight > pdfHeight) {
        const ratio = pdfHeight / contentHeight;
        finalWidth = pdfWidth * ratio;
        finalHeight = pdfHeight;
      }
      
      const xOffset = (pdfWidth - finalWidth) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, 0, finalWidth, finalHeight, undefined, 'FAST');
      
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
        windowWidth: 800,
        onclone: (clonedDoc) => {
          const invoice = clonedDoc.querySelector('.print-invoice') as HTMLElement;
          if (invoice) {
            // Helper to normalize colors to RGB (fixes oklch/oklab issues in html2canvas)
            const normalizeColor = (color: string) => {
              if (!color || color === 'transparent' || color === 'none' || color.startsWith('rgb')) return color;
              try {
                const tempCanvas = clonedDoc.createElement('canvas');
                tempCanvas.width = 1;
                tempCanvas.height = 1;
                const ctx = tempCanvas.getContext('2d');
                if (!ctx) return color;
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 1, 1);
                const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
                return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
              } catch (e) {
                return color;
              }
            };

            // Force all colors to be hex/rgb to avoid oklch issues in html2canvas
            const allElements = invoice.querySelectorAll('*');
            allElements.forEach((el) => {
              if (el instanceof HTMLElement) {
                const style = window.getComputedStyle(el);
                el.style.color = normalizeColor(style.color);
                el.style.backgroundColor = normalizeColor(style.backgroundColor);
                el.style.borderColor = normalizeColor(style.borderColor);
                // Fix for uneven text
                el.style.fontVariantLigatures = 'none';
                el.style.textRendering = 'geometricPrecision';
                (el.style as any).webkitFontSmoothing = 'antialiased';
              }

              // Special handling for SVGs (icons) to ensure visibility in html2canvas
              if (el instanceof SVGElement) {
                const style = window.getComputedStyle(el);
                const stroke = style.stroke !== 'none' ? style.stroke : '';
                const fill = style.fill !== 'none' ? style.fill : '';
                
                if (stroke) el.setAttribute('stroke', normalizeColor(stroke));
                if (fill) el.setAttribute('fill', normalizeColor(fill));
                
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
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const contentHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let finalWidth = pdfWidth;
      let finalHeight = contentHeight;
      
      if (contentHeight > pdfHeight) {
        const ratio = pdfHeight / contentHeight;
        finalWidth = pdfWidth * ratio;
        finalHeight = pdfHeight;
      }
      
      const xOffset = (pdfWidth - finalWidth) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, 0, finalWidth, finalHeight, undefined, 'FAST');
      
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
                    className="bg-white shadow-2xl mx-auto p-[10mm] w-[210mm] border border-[#F2F2F2] print:shadow-none print:border-none text-[#1A1A1A] print-invoice"
                  >
                {/* Header Section */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    {logoPreview && (
                      <img src={logoPreview} alt="Logo" className="h-14 w-14 object-contain" referrerPolicy="no-referrer" />
                    )}
                    <div>
                      {data.company.name && <h1 className="text-xl font-black tracking-tighter text-[#000000] uppercase leading-none">{data.company.name}</h1>}
                      {data.company.address && <p className="text-xs text-[#666666] leading-tight mt-1 max-w-[280px]">{data.company.address}</p>}
                      {data.company.customInfo && <p className="text-[10px] text-[#888888] mt-1 font-bold uppercase tracking-widest">{data.company.customInfo}</p>}
                    </div>
                  </div>
                  <div className="text-right space-y-0.5">
                    {data.company.phone && <p className="text-xs font-bold">{data.company.phone}</p>}
                    {data.company.email && <p className="text-xs font-bold text-[#666666]">{data.company.email}</p>}
                    {data.company.website && <p className="text-xs font-bold text-[#666666]">{data.company.website}</p>}
                  </div>
                </div>

                <div className="h-[1px] bg-black/10 w-full mb-4" />

                {/* Title and Invoice Info */}
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-[#000000] leading-none">Invoice</h2>
                    <p className="text-xs font-bold text-[#888888] mt-1">#{data.invoice.number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-[#888888] uppercase tracking-[0.2em] mb-1">Date of Issue</p>
                    <p className="text-sm font-bold">{data.invoice.date}</p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-8 mb-6">
                  <div>
                    <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#888888] mb-2 border-b border-[#EEEEEE] pb-1">Passenger</h3>
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold">{data.passenger.name}</p>
                      <p className="text-xs font-bold text-[#666666]">{data.passenger.phone}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#888888] mb-2 border-b border-[#EEEEEE] pb-1">Trip Route</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] font-black text-[#AAAAAA] uppercase tracking-widest mb-0.5">Pickup</p>
                        <p className="text-xs font-bold leading-tight">{data.trip.pickup}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-[#AAAAAA] uppercase tracking-widest mb-0.5">Drop</p>
                        <p className="text-xs font-bold leading-tight">{data.trip.drop}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vehicle Info Bar */}
                <div className="bg-[#F8F9FA] border border-black/5 rounded-lg p-3 flex justify-between items-center mb-6">
                  <div>
                    <p className="text-[8px] font-bold text-[#888888] uppercase tracking-[0.2em] mb-0.5">Vehicle Details</p>
                    <p className="text-sm font-bold uppercase">{data.vehicle.type} — {data.vehicle.number}</p>
                  </div>
                  {!(data.fare.hours > 0 || data.fare.extraKms > 0) && data.fare.distance > 0 && (
                    <div className="text-right">
                      <p className="text-[8px] font-bold text-[#888888] uppercase tracking-[0.2em] mb-0.5">Total Distance</p>
                      <p className="text-sm font-bold">{data.fare.distance} Kms</p>
                    </div>
                  )}
                </div>

                {/* Fare Breakdown */}
                <div className="mb-6">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#888888] mb-3 border-b border-[#EEEEEE] pb-1">Charges Breakdown</h3>
                  <div className="space-y-2">
                    {data.fare.baseFare > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Base Fare</p>
                        <p className="text-xs font-bold">₹{data.fare.baseFare.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.distance > 0 && data.fare.ratePerKm > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Kms Charge <span className="text-[9px] text-[#AAAAAA] ml-2">({data.fare.distance} km × ₹{data.fare.ratePerKm})</span></p>
                        <p className="text-xs font-bold">₹{(data.fare.distance * data.fare.ratePerKm).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.hours > 0 && data.fare.ratePerHour > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Hourly Charge <span className="text-[9px] text-[#AAAAAA] ml-2">({data.fare.hours} hrs × ₹{data.fare.ratePerHour})</span></p>
                        <p className="text-xs font-bold">₹{(data.fare.hours * data.fare.ratePerHour).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.extraKms > 0 && data.fare.extraKmsRate > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Extra Kms Charge <span className="text-[9px] text-[#AAAAAA] ml-2">({data.fare.extraKms} km × ₹{data.fare.extraKmsRate})</span></p>
                        <p className="text-xs font-bold">₹{(data.fare.extraKms * data.fare.extraKmsRate).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.toll > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Toll & Parking</p>
                        <p className="text-xs font-bold">₹{data.fare.toll.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.permit > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Permit Charges</p>
                        <p className="text-xs font-bold">₹{data.fare.permit.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.waitingMinutes > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Waiting Charges</p>
                        <p className="text-xs font-bold">₹{(data.fare.waitingMinutes * data.fare.waitingRate).toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.driverBata > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Driver Bata</p>
                        <p className="text-xs font-bold">₹{data.fare.driverBata.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.peakCharge > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Peak Charge</p>
                        <p className="text-xs font-bold">₹{data.fare.peakCharge.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.extraCharges > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Extra Charges</p>
                        <p className="text-xs font-bold">₹{data.fare.extraCharges.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.surcharge > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Surcharge</p>
                        <p className="text-xs font-bold">₹{data.fare.surcharge.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.dayRent > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Day Rent</p>
                        <p className="text-xs font-bold">₹{data.fare.dayRent.toFixed(2)}</p>
                      </div>
                    )}
                    {data.fare.hillsCharge > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-[#444444]">Hills Charge</p>
                        <p className="text-xs font-bold">₹{data.fare.hillsCharge.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Totals */}
                <div className="mb-6 rounded-xl border shadow-sm p-4 space-y-3 bg-white">

<div className="flex justify-between">
    <span className="text-gray-600 font-semibold">
      Grand Total
    </span>
    <span className="font-bold text-lg">
      ₹{calculateTotal().grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </span>
  </div>

  {/* Advance Paid */}
  {data.fare.advancePaid > 0 && (
    <div className="flex justify-between text-red-600">
      <span className="font-semibold">
        Advance Paid
      </span>
      <span className="font-bold text-lg">
        - ₹{data.fare.advancePaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
    </div>
  )}

  {/* Balance Payable */}
  <div className="border-t pt-3 flex justify-between items-center">
    <span className="text-blue-600 font-bold uppercase">
      Balance Payable
    </span>
    <span className="font-bold text-lg text-blue-600">
      ₹{calculateTotal().balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </span>
  </div>

</div>
                {data.notes && (
                  <div className="mb-6">
                    <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#888888] mb-1.5 border-b border-[#EEEEEE] pb-1">Terms & Notes</h3>
                    <p className="text-xs text-[#666666] whitespace-pre-wrap leading-relaxed">{data.notes}</p>
                  </div>
                )}

                {/* Footer Info */}
                <div className="mb-6">
                  <p className="text-[8px] font-black text-[#AAAAAA] uppercase tracking-[0.2em] mb-1">Driver</p>
                  <p className="text-sm font-bold uppercase tracking-tight">{data.driver.name}</p>
                </div>

                {/* Closing Message */}
                <div className="text-center pt-4 border-t border-[#EEEEEE]">
                  <p className="text-xs font-bold text-[#000000] uppercase tracking-widest mb-0.5">Thank you for travelling with us</p>
                  <p className="text-[9px] font-bold text-[#AAAAAA] uppercase tracking-[0.2em]">Computer Generated Invoice</p>
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
