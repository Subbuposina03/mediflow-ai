import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ReportHistory } from '../components/ReportHistory';
import { 
  Calendar, Clock, ShieldAlert, FileText, CheckCircle2, 
  XCircle, AlertCircle, PlusCircle, User, Activity, FileHeart,
  BrainCircuit, RefreshCw, CreditCard, Download
} from 'lucide-react';
import { QueueTokenDetailed, Department } from '../types';
import { useToast } from '../context/ToastContext';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { formatDateTime12, formatTimeWithSeconds12 } from '../utils/formatTime';

export const PatientDashboard: React.FC = () => {
  const { user } = useAuth();
  const { subscribe, unsubscribe, lastMessage } = useSocket();
  const { showToast } = useToast();
  
  // State
  const [tokens, setTokens] = useState<QueueTokenDetailed[]>([]);
  const [liveQueue, setLiveQueue] = useState<{ active: any[], pending: any[] } | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('Just now');

  // Profile Form State
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Male');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Booking Form State
  const [deptId, setDeptId] = useState<number>(0);
  const [symptoms, setSymptoms] = useState('');
  const [emergencyLevel, setEmergencyLevel] = useState<number>(1);
  const [apptTime, setApptTime] = useState('');
  const [bookSuccess, setBookSuccess] = useState(false);
  const [booking, setBooking] = useState(false);

  // Payments & Doctor Selection State
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentBreakdown, setPaymentBreakdown] = useState<any>(null);
  const [paymentFailedData, setPaymentFailedData] = useState<{ orderId: string; errorMsg: string } | null>(null);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'PAY_AT_COUNTER'>('PAY_AT_COUNTER');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // AI Symptom Analyzer State
  const [analyzingSymptoms, setAnalyzingSymptoms] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    risk_level: string;
    triage_advice: string;
    recommended_specialty: string;
    self_care_steps: string[];
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // AI Department Recommendation State
  const [deptRecommendation, setDeptRecommendation] = useState<any>(null);
  const [recommendationLoading, setRecommendationLoading] = useState<boolean>(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  // Medicine Reminders State
  const [reminders, setReminders] = useState<any[]>([]);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medTimes, setMedTimes] = useState('1-0-1');

  // Load Initial Data
  const fetchData = async () => {
    try {
      const [tokensRes, deptsRes, profileRes, paymentsRes] = await Promise.all([
        axios.get('/queue/my-tokens'),
        axios.get('/queue/departments'),
        axios.get('/patient/profile'),
        axios.get('/payments/history')
      ]);
      setTokens(tokensRes.data);
      setDepartments(deptsRes.data);
      setPaymentHistory(paymentsRes.data);
      setDob(profileRes.data.date_of_birth || "");
      setGender(profileRes.data.gender || "Male");
      setBloodGroup(profileRes.data.blood_group || "O+");
      setMedicalHistory(profileRes.data.medical_history || "");
      if (deptsRes.data.length > 0 && !deptId) {
        setDeptId(deptsRes.data[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to retrieve dashboard information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const fetchDoctors = async () => {
      if (!deptId) return;
      try {
        const res = await axios.get(`/queue/doctors?department_id=${deptId}`);
        setDoctorsList(res.data);
        setSelectedDoctorId(null);
      } catch (err) {
        console.error("Failed to load department doctors", err);
      }
    };
    fetchDoctors();
  }, [deptId]);

  // AI Department Recommendation Debounce Effect
  useEffect(() => {
    if (!symptoms || !symptoms.trim()) {
      setDeptRecommendation(null);
      return;
    }

    const timer = setTimeout(async () => {
      setRecommendationLoading(true);
      setRecommendationError(null);
      try {
        const res = await axios.post('/patient/recommend-department', {
          symptoms: symptoms
        });
        setDeptRecommendation(res.data);
        if (res.data.department_id) {
          setDeptId(res.data.department_id);
        }
      } catch (err) {
        console.error(err);
        setRecommendationError('AI recommendation unavailable. Please choose a department manually.');
        const genMedDept = departments.find(d => d.name === 'General Medicine');
        if (genMedDept) {
          setDeptId(genMedDept.id);
        }
      } finally {
        setRecommendationLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [symptoms, departments]);

  // Filter out active or pending tokens for WebSocket monitoring
  const activeToken = tokens.find(t => t.status === 'pending' || t.status === 'active');

  // WebSocket Subscription
  useEffect(() => {
    if (activeToken) {
      subscribe(activeToken.department_id);
    } else {
      unsubscribe();
    }
    return () => unsubscribe();
  }, [activeToken?.id]);

  // Fetch live queue data when active token changes
  useEffect(() => {
    const fetchLiveQueue = async () => {
      if (activeToken) {
        try {
          const res = await axios.get(`/queue/departments/${activeToken.department_id}/live`);
          setLiveQueue(res.data);
        } catch (err) {
          console.error("Failed to fetch live queue", err);
        }
      } else {
        setLiveQueue(null);
      }
    };
    fetchLiveQueue();
  }, [activeToken?.id]);

  // Handle WebSocket updates
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'queue_update' && activeToken) {
      if (lastMessage.department_id === activeToken.department_id) {
        const pendingList = lastMessage.pending || [];
        const activeList = lastMessage.active || [];
        
        // Update live queue data instantly
        setLiveQueue({ active: activeList, pending: pendingList });

        // Update last updated timestamp
        setLastUpdated(formatTimeWithSeconds12(new Date()));

        // Check if our token is still in the active or pending list
        const isStillInQueue = 
          activeList.some((a: any) => a.id === activeToken.id) ||
          pendingList.some((p: any) => p.id === activeToken.id);

        if (!isStillInQueue) {
          // Token has been completed, skipped, or cancelled. Refresh patient tokens.
          fetchData();
        } else {
          // Keep local token status and wait time updated with live values
          const foundInActive = activeList.find((a: any) => a.id === activeToken.id);
          const foundIndexInPending = pendingList.findIndex((p: any) => p.id === activeToken.id);

          setTokens(prev => prev.map(t => {
            if (t.id === activeToken.id) {
              if (foundInActive) {
                return { ...t, status: 'active', predicted_wait_time: 0 };
              }
              if (foundIndexInPending !== -1) {
                const socketItem = pendingList[foundIndexInPending];
                return { 
                  ...t, 
                  status: 'pending', 
                  predicted_wait_time: socketItem.predicted_wait_time || t.predicted_wait_time 
                };
              }
            }
            return t;
          }));
        }
      }
    }
  }, [lastMessage]);

  const handleAnalyzeSymptoms = async () => {
    if (!symptoms.trim()) {
      showToast("Please enter symptoms to analyze first.", "info");
      return;
    }
    setAnalyzingSymptoms(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const res = await axios.post('/queue/symptoms/analyze', {
        symptoms,
        emergency_level: emergencyLevel
      });
      setAnalysisResult(res.data);
      showToast("AI Health Analysis completed successfully.", "success");
    } catch (err: any) {
      console.error(err);
      setAnalysisError("Could not generate AI analysis. Using local queue defaults.");
      showToast("AI health analysis failed. Using defaults.", "error");
    } finally {
      setAnalyzingSymptoms(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('med_reminders');
    if (saved) {
      setReminders(JSON.parse(saved));
    }
  }, []);

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!medName.trim()) return;
    const newRem = {
      id: Date.now(),
      name: medName,
      dosage: medDosage,
      times: medTimes
    };
    const updated = [...reminders, newRem];
    setReminders(updated);
    localStorage.setItem('med_reminders', JSON.stringify(updated));
    setMedName('');
    setMedDosage('');
    setMedTimes('1-0-1');
    showToast("Medicine reminder added successfully.", "success");
  };

  const handleDeleteReminder = (id: number) => {
    const updated = reminders.filter(r => r.id !== id);
    setReminders(updated);
    localStorage.setItem('med_reminders', JSON.stringify(updated));
    showToast("Medicine reminder deleted.", "info");
  };

  const handleDownloadPDF = async (tokenId: number, tokenNumber: string) => {
    try {
      showToast("Compiling prescription PDF...", "info");
      const res = await axios.get(`/queue/tokens/${tokenId}/prescription/pdf`, {
        responseType: 'blob'
      });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `prescription_${tokenNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("Prescription PDF downloaded successfully.", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Could not download prescription PDF.", "error");
    }
  };

  const handleExportCSV = async () => {
    try {
      showToast("Exporting consultation log...", "info");
      const res = await axios.get('/queue/history/export', {
        responseType: 'blob'
      });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'consultation_history.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("Consultation history exported.", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Could not export consultation history.", "error");
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptId) {
      showToast("Please select a department first.", "info");
      return;
    }
    setError(null);
    setPaymentError(null);
    
    const dept = departments.find(d => d.id === deptId);
    if (!dept) {
      showToast("Selected department not found.", "error");
      return;
    }

    const consultation_fee = dept.consultation_fee || 500;
    const gst = consultation_fee * 0.18;
    const total_amount = consultation_fee + gst;

    setPaymentBreakdown({
      consultation_fee,
      taxes: gst,
      total_amount
    });

    setPaymentMethod('PAY_AT_COUNTER');
    setShowPaymentModal(true);
  };

  const handleCounterSubmit = async () => {
    if (!paymentBreakdown) return;
    setSubmittingPayment(true);
    setPaymentError(null);
    try {
      const defaultTime = apptTime ? new Date(apptTime).toISOString() : new Date().toISOString();
      await axios.post("/payments/counter-submit", {
        department_id: deptId,
        doctor_id: selectedDoctorId,
        appointment_time: defaultTime,
        symptoms: symptoms,
        emergency_level: emergencyLevel
      });

      setBookSuccess(true);
      setTimeout(() => setBookSuccess(false), 5000);
      showToast("Appointment booked successfully. Please complete the payment at the hospital reception before your consultation.", "success");
      
      setSymptoms('');
      setApptTime('');
      setEmergencyLevel(1);
      setSelectedDoctorId(null);
      setAnalysisResult(null);
      setPaymentFailedData(null);
      
      fetchData();
      setShowPaymentModal(false);
    } catch (err: any) {
      setPaymentError(err.response?.data?.detail || "Appointment booking failed.");
      showToast(err.response?.data?.detail || "Appointment booking failed.", "error");
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleCancel = async (tokenId: number) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      const res = await axios.post(`/queue/cancel/${tokenId}`);
      setTokens(prev => prev.map(t => t.id === tokenId ? res.data : t));
      showToast("Appointment cancelled successfully.", "info");
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to cancel appointment', "error");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await axios.put("/admin/patient/profile", {
        gender,
        blood_group: bloodGroup,
        medical_history: medicalHistory,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      showToast("Medical parameters updated successfully.", "success");
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not update medical details.");
      showToast(err.response?.data?.detail || "Could not update medical details.", "error");
    }
  };

  const isFirstInQueue = () => {
    if (!activeToken || !liveQueue) return false;
    const activeList = liveQueue.active || [];
    const pendingList = liveQueue.pending || [];
    const overallQueue = [...activeList, ...pendingList];
    return overallQueue.length > 0 && overallQueue[0].id === activeToken.id;
  };

  const getCurrentToken = () => {
    if (!activeToken) return 'No active appointments';
    if (!liveQueue) return 'Calculating...';
    const activeList = liveQueue.active || [];
    if (activeList.length > 0) {
      return activeList[0].token_number;
    }
    const pendingList = liveQueue.pending || [];
    if (pendingList.length > 0) {
      return pendingList[0].token_number;
    }
    return 'No active appointments';
  };

  const getPatientsAheadCount = () => {
    if (!activeToken || !liveQueue) return 0;
    const activeList = liveQueue.active || [];
    const pendingList = liveQueue.pending || [];
    const overallQueue = [...activeList, ...pendingList];
    const yourIndex = overallQueue.findIndex(t => t.id === activeToken.id);
    if (yourIndex === -1) return 0;
    
    const yourQueuePosition = yourIndex + 1;
    const currentQueuePosition = 1;
    const ahead = yourQueuePosition - currentQueuePosition;
    return ahead > 0 ? ahead : 0;
  };

  const getEstimatedWaitTime = () => {
    if (!activeToken) return 0;
    if (activeToken.status === 'active') return 0;
    if (!liveQueue) return activeToken.predicted_wait_time || 0;
    const pendingList = liveQueue.pending || [];
    const match = pendingList.find(p => p.id === activeToken.id);
    return match ? match.predicted_wait_time : (activeToken.predicted_wait_time || 0);
  };

  const getStatusText = () => {
    if (!activeToken) return '';
    if (isFirstInQueue()) return "It's your turn";
    return activeToken.status === 'active' ? 'Called for consultation' : 'Waiting in Queue';
  };

  const getProgressPercentage = () => {
    if (!activeToken) return 0;
    if (activeToken.status === 'active') return 100;
    if (!liveQueue) return 0;
    const activeList = liveQueue.active || [];
    const pendingList = liveQueue.pending || [];
    const overallQueue = [...activeList, ...pendingList];
    const totalInQueue = overallQueue.length;
    const position = overallQueue.findIndex(t => t.id === activeToken.id);
    if (position === -1) return 0;
    return totalInQueue > 0 ? Math.max(10, Math.min(100, ((totalInQueue - position) / totalInQueue) * 100)) : 10;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-pulse">
        <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
            <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          </div>
          <div className="space-y-6">
            <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
            <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
      {/* Welcome Banner */}
      <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 mb-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 animate-slide-up hover-lift">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Hello, {user?.name || 'Patient'}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Track your appointments, view live wait time estimates, and optimize doctor wait times.
          </p>
        </div>
        <div className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-md flex items-center gap-1.5 cursor-default transition-all duration-300">
          <Activity className="h-4.5 w-4.5 animate-pulse" />
          <span>Patient Account Active</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2.5 bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/50 text-red-755 dark:text-red-455 p-4 rounded-2xl animate-alert-slide-down">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Live Queue Tracker & Booking */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Live Queue Tracker */}
          {activeToken ? (
            <div className="glass rounded-3xl p-6 border border-sky-200 dark:border-sky-900 shadow-md bg-gradient-to-br from-white to-sky-50/20 dark:from-slate-900 dark:to-sky-950/10 relative overflow-hidden transition-all duration-300 animate-slide-up hover-lift">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-sky-500/10 rounded-full filter blur-xl" />
              
              <div className="flex justify-between items-center mb-6">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-450 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/40 shadow-sm animate-pulse-live">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>● Live Health Updates</span>
                </span>
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  Last sync: {lastUpdated}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-center transition-all duration-300 hover:scale-[1.02] hover:bg-white dark:hover:bg-slate-800 shadow-sm">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-1">
                    Current Token
                  </span>
                  <span className="text-lg font-black text-slate-800 dark:text-white transition-all duration-500">
                    {getCurrentToken()}
                  </span>
                </div>
                <div className="bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-center transition-all duration-300 hover:scale-[1.02] hover:bg-white dark:hover:bg-slate-800 shadow-sm">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-1">
                    Your Token
                  </span>
                  <span className="text-lg font-black text-sky-600 dark:text-sky-400">
                    {activeToken.token_number}
                  </span>
                </div>
                <div className="bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-center transition-all duration-300 hover:scale-[1.02] hover:bg-white dark:hover:bg-slate-800 shadow-sm">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-1">
                    Patients Ahead
                  </span>
                  <span className="text-lg font-black text-slate-800 dark:text-white transition-all duration-500">
                    <AnimatedCounter value={getPatientsAheadCount()} />
                  </span>
                </div>
                <div className="bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-center transition-all duration-300 hover:scale-[1.02] hover:bg-white dark:hover:bg-slate-800 shadow-sm">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-1">
                    Est. Wait Time
                  </span>
                  <span className="text-lg font-black text-sky-600 dark:text-sky-400 transition-all duration-500">
                    <AnimatedCounter value={getEstimatedWaitTime()} /> <span className="text-xs font-bold">mins</span>
                  </span>
                </div>
              </div>
              
              {/* Progress and status details */}
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <span>Health Check Progress</span>
                    <span className="text-sky-600 dark:text-sky-400">{Math.round(getProgressPercentage())}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800/80 h-2.5 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-850 shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full rounded-full transition-all duration-1000 ease-out progress-bar-animated" 
                      style={{ width: `${getProgressPercentage()}%` }} 
                      id="queue-progress-bar"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <strong>Department:</strong> {activeToken.department.name} | <strong>Status:</strong>{' '}
                    <span className={`font-bold capitalize ${isFirstInQueue() ? 'text-indigo-600 dark:text-indigo-400 animate-pulse' : (activeToken.status === 'active' ? 'text-indigo-600 dark:text-indigo-400 animate-pulse' : 'text-sky-600 dark:text-sky-400')}`}>
                      {getStatusText()}
                    </span>
                  </p>
                  <button 
                    onClick={() => handleCancel(activeToken.id)}
                    className="bg-red-50 hover:bg-red-100 dark:bg-red-955/20 dark:hover:bg-red-900/30 text-red-650 dark:text-red-400 text-xs font-bold px-4 py-2 rounded-xl transition-all duration-250 shadow-sm hover:scale-[1.03] active:scale-[0.97]"
                  >
                    Cancel Booking
                  </button>
                </div>
              </div>
            </div>
          ) : (() => {
            const pendingVerification = paymentHistory.find(p => p.payment_status === "Pending Verification");
            const rejectedPayment = paymentHistory.find(p => p.payment_status === "Rejected");
            
            if (pendingVerification) {
              return (
                <div className="bg-amber-50/10 dark:bg-amber-950/5 rounded-3xl p-8 border border-dashed border-amber-300 dark:border-amber-900/50 text-center flex flex-col items-center justify-center gap-3 animate-slide-up hover-lift">
                  <div className="bg-amber-500/10 p-3.5 rounded-2xl text-amber-600 dark:text-amber-400 animate-pulse">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-amber-800 dark:text-amber-450">Payment Verification Pending</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Your payment verification request (Receipt: <span className="font-mono">{pendingVerification.receipt_number}</span>) is under review. Please complete payment at the reception counter before your consultation.
                    </p>
                  </div>
                </div>
              );
            }

            if (rejectedPayment && !paymentFailedData) {
              return (
                <div className="bg-red-50/10 dark:bg-red-955/5 rounded-3xl p-8 border border-dashed border-red-300 dark:border-red-900/50 text-center flex flex-col items-center justify-center gap-3 animate-slide-up hover-lift">
                  <div className="bg-red-500/10 p-3.5 rounded-2xl text-red-650 dark:text-red-400">
                    <AlertCircle className="h-6 w-6 animate-bounce" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-extrabold text-red-800 dark:text-red-400">Payment Rejected</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Your payment verification request (Receipt: <span className="font-mono">{rejectedPayment.receipt_number}</span>) was rejected by the administrator. 
                      {rejectedPayment.admin_remarks && <span> Remarks: <strong>{rejectedPayment.admin_remarks}</strong></span>}
                    </p>
                    <button
                      onClick={() => {
                        showToast("Please submit a new booking request below.", "info");
                      }}
                      className="mt-2 text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      Book Again
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="bg-white dark:bg-slate-900/40 rounded-3xl p-8 border border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-3 animate-slide-up hover-lift">
                <div className="bg-sky-500/10 p-3.5 rounded-2xl text-sky-600 dark:text-sky-400">
                  <Clock className="h-6 w-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-800 dark:text-white">No Active Queue Token</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                    You currently have no pending or active tokens. Request an appointment below to join a live doctor queue.
                  </p>
                </div>
              </div>
            );
          })()}          {/* Book Doctor Consultation Card */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
              <PlusCircle className="h-5 w-5 text-sky-600 dark:border-sky-400" />
              <span>Book Doctor Consultation</span>
            </h2>

              {bookSuccess && (
                <div className="mb-4 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-450 p-3 rounded-xl text-sm">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Appointment booked successfully! Health check token generated.</span>
                </div>
              )}

            <form onSubmit={handleBook} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-350 mb-1.5">
                    Select Department
                  </label>
                  <select
                    value={deptId}
                    onChange={(e) => setDeptId(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name} (avg: {d.average_consultation_time}m)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-350 mb-1.5">
                    Select Doctor
                  </label>
                  <select
                    value={selectedDoctorId || ""}
                    onChange={(e) => setSelectedDoctorId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                  >
                    <option value="">General Pool (Any Doctor)</option>
                    {doctorsList.map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.name} ({doc.specialization || "Generalist"})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-350 mb-1.5">
                    Emergency Priority Level
                  </label>
                  <select
                    value={emergencyLevel}
                    onChange={(e) => setEmergencyLevel(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-855 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                  >
                    <option value={1}>Level 1 - Non Urgent (Routine checkup)</option>
                    <option value={2}>Level 2 - Minor Concern (Mild fever, cough)</option>
                    <option value={3}>Level 3 - Urgent Concern (Sprains, moderate pain)</option>
                    <option value={4}>Level 4 - Severe Emergency (Bone breaks, severe chest pain)</option>
                    <option value={5}>Level 5 - Critical (Life-threatening trauma, cardiac event)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-350 mb-1.5">
                  Consultation Target Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={apptTime}
                  onChange={(e) => setApptTime(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition text-sm"
                />
              </div>              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-350 mb-1.5">
                  Describe Symptoms (AI Health Check input)
                </label>
                <textarea
                  required
                  rows={3}
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Include vital details like duration, chest tightness, respiratory difficulties, pain scale (1-10)..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-855 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition text-sm"
                />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-[10px] text-slate-400">AI health analysis is advisory only.</span>
                  <button
                    type="button"
                    onClick={handleAnalyzeSymptoms}
                    disabled={analyzingSymptoms}
                    className="text-xs text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg transition"
                  >
                    {analyzingSymptoms ? "Analyzing..." : "Analyze with AI"}
                  </button>
                </div>

                {/* AI Department Recommendation Display */}
                {(recommendationLoading || deptRecommendation || recommendationError) && (
                  <div className="mt-3 p-4 rounded-xl border border-sky-200/50 dark:border-sky-900/50 bg-sky-50/25 dark:bg-sky-950/10 text-xs space-y-2">
                    <p className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <BrainCircuit className="h-4 w-4 text-sky-500 animate-pulse" />
                      <span>AI Recommended Department</span>
                    </p>
                    
                    {recommendationLoading ? (
                      <div className="flex items-center gap-1.5 text-slate-500 py-1">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-500" />
                        <span>Analyzing symptoms to determine department...</span>
                      </div>
                    ) : recommendationError ? (
                      <p className="text-red-500 italic">{recommendationError}</p>
                    ) : deptRecommendation ? (
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-200/40 dark:border-slate-800/40">
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
                            {deptRecommendation.department_name === 'Cardiology' && '❤️'}
                            {deptRecommendation.department_name === 'Pediatrics' && '👶'}
                            {deptRecommendation.department_name === 'General Medicine' && '🩺'}
                            <span>{deptRecommendation.department_name}</span>
                          </span>
                          <span className="font-bold bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded text-[10px]">
                            Confidence {deptRecommendation.confidence}%
                          </span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 italic">"{deptRecommendation.reasoning}"</p>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* AI Health Analysis */}
                {analysisResult && (
                  <div className={`mt-3 p-4 rounded-xl border text-xs space-y-2 ${
                    analysisResult.risk_level === 'Critical' || analysisResult.risk_level === 'High'
                      ? 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-450'
                      : 'bg-sky-50/50 dark:bg-sky-900/15 border-sky-200 dark:border-sky-900/50 text-sky-700 dark:text-sky-400'
                  }`}>
                    <div className="flex justify-between items-center font-bold">
                      <span className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5 animate-pulse text-sky-600" />
                        AI Health Analysis: {analysisResult.risk_level} Risk
                      </span>
                      <span>Rec. Specialty: {analysisResult.recommended_specialty}</span>
                    </div>
                    <p className="italic text-slate-600 dark:text-slate-300">"{analysisResult.triage_advice}"</p>
                    {analysisResult.self_care_steps && analysisResult.self_care_steps.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-200/50 dark:border-slate-800">
                        <p className="font-bold mb-1 text-slate-700 dark:text-slate-300">Recommended Self-Care Steps:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                          {analysisResult.self_care_steps.map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {analysisError && (
                  <p className="text-xs text-red-500 mt-2">{analysisError}</p>
                )}
              </div>

              {/* Consultation Fee Summary */}
              <div className="bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 p-4 rounded-2xl flex justify-between items-center text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-bold">Consultation Fee</span>
                  <p className="text-base font-black text-slate-800 dark:text-white">
                    ₹{departments.find(d => d.id === deptId)?.consultation_fee || 500}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-bold">GST Tax (18%)</span>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-350">
                    ₹{Math.round((departments.find(d => d.id === deptId)?.consultation_fee || 500) * 0.18)}
                  </p>
                </div>
                <div className="text-right border-l pl-4 border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 font-bold">Total Price</span>
                  <p className="text-base font-black text-sky-600 dark:text-sky-400">
                    ₹{Math.round((departments.find(d => d.id === deptId)?.consultation_fee || 500) * 1.18)}
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={booking}
                className="w-full flex items-center justify-center space-x-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-xl transition shadow-md disabled:opacity-75 disabled:pointer-events-none"
              >
                <span>{booking ? 'Initiating Payment Gateway...' : 'Pay & Book Appointment'}</span>
              </button>
            </form>
          </div>

          {/* Payment History Widget */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift mt-6">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
              <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-450" />
              <span>Payment History</span>
            </h2>

            {paymentHistory.length === 0 ? (
              <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                <p className="text-sm">No transaction logs available.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-2">Date & Time</th>
                      <th className="py-3 px-2">Receipt</th>
                      <th className="py-3 px-2">Method</th>
                      <th className="py-3 px-2">Transaction Ref</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                    {paymentHistory.map((pay: any) => (
                      <tr key={pay.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="py-3 px-2 font-medium">
                          {formatDateTime12(pay.created_time)}
                        </td>
                        <td className="py-3 px-2 font-mono text-[10px] text-slate-500">{pay.receipt_number}</td>
                        <td className="py-3 px-2 uppercase font-semibold text-[10px] text-slate-500">{pay.payment_method}</td>
                        <td className="py-3 px-2 font-mono text-[10px] text-slate-500">
                          {pay.receipt_number || "—"}
                        </td>
                        <td className="py-3 px-2 font-black text-slate-900 dark:text-white">₹{pay.amount.toFixed(2)}</td>
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            (pay.payment_status === 'Paid' || pay.payment_status === 'Verified')
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30'
                              : (pay.payment_status === 'Rejected' || pay.payment_status === 'Failed' || pay.payment_status === 'Cancelled')
                              ? 'bg-red-50 dark:bg-red-955/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                              : pay.payment_status === 'Pending at Counter'
                              ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-450 border border-purple-100 dark:border-purple-900/30'
                              : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-450 border border-amber-100 dark:border-amber-900/30'
                          }`}>
                            {pay.payment_status}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          {(pay.payment_status === 'Paid' || pay.payment_status === 'Verified') && (
                            <a
                              href={`${axios.defaults.baseURL || '/api/v1'}/payments/receipt/${pay.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="inline-flex items-center justify-end gap-1 text-[10px] text-sky-600 hover:text-sky-700 font-bold"
                            >
                              <Download className="h-3 w-3" />
                              <span>PDF</span>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Medical History & consultation history */}
        <div className="space-y-6">
          
          {/* Medical Profile Setup */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
              <FileHeart className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <span>Medical History</span>
            </h2>

            {profileSuccess && (
              <div className="mb-4 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-450 p-2.5 rounded-xl text-xs">
                <CheckCircle2 className="h-4.5 w-4.5" />
                <span>Health updates submitted successfully.</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full p-2 border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-xs"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Blood Group
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full p-2 border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-xs"
                  >
                    <option>A+</option>
                    <option>A-</option>
                    <option>B+</option>
                    <option>B-</option>
                    <option>AB+</option>
                    <option>AB-</option>
                    <option>O+</option>
                    <option>O-</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Chronic Illnesses / History
                </label>
                <textarea
                  rows={3}
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  placeholder="Example: Type II Diabetes, Penicillin Allergy..."
                  className="w-full p-2 border border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold py-2 rounded-xl text-xs transition"
              >
                Save Clinical Parameters
              </button>
            </form>
          </div>

          {/* Medicine Reminders Card */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-sky-600" />
              <span>Medicine Reminders</span>
            </h2>

            <form onSubmit={handleAddReminder} className="space-y-3 mb-4 border-b border-slate-100 dark:border-slate-850 pb-4">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Medicine Name"
                  value={medName}
                  onChange={(e) => setMedName(e.target.value)}
                  className="p-2 border border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-xs"
                />
                <input
                  type="text"
                  placeholder="Dosage (e.g. 500mg)"
                  value={medDosage}
                  onChange={(e) => setMedDosage(e.target.value)}
                  className="p-2 border border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-xs"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={medTimes}
                  onChange={(e) => setMedTimes(e.target.value)}
                  className="flex-1 p-2 border border-slate-350 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-xs"
                >
                  <option value="1-0-1">Twice daily (1-0-1)</option>
                  <option value="1-1-1">Thrice daily (1-1-1)</option>
                  <option value="1-0-0">Once daily - Morning (1-0-0)</option>
                  <option value="0-0-1">Once daily - Night (0-0-1)</option>
                </select>
                <button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 rounded-xl text-xs transition"
                >
                  Add
                </button>
              </div>
            </form>

            {reminders.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-xs">No active medicine reminders.</p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {reminders.map(r => (
                  <div key={r.id} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-850 rounded-xl text-xs">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">{r.name}</p>
                      <p className="text-[10px] text-slate-400">{r.dosage ? `${r.dosage} | ` : ''}{r.times}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteReminder(r.id)}
                      className="text-rose-600 hover:text-rose-700 text-[10px] font-bold"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Medical Reports Card */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
              <FileText className="h-5 w-5 text-sky-600" />
              <span>Medical Reports & Files</span>
            </h2>
            <ReportHistory mode="patient" />
          </div>

          {/* Consultation History */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm max-h-[400px] overflow-y-auto animate-slide-up hover-lift">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span>Consultation History</span>
              </h2>
              {tokens.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="text-xs text-sky-650 hover:text-sky-700 font-bold bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg transition"
                >
                  Export CSV
                </button>
              )}
            </div>

            {tokens.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-xs">No past logs exist.</p>
            ) : (
              <div className="space-y-4">
                {tokens.map(t => (
                  <div key={t.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800 dark:text-white">Token: {t.token_number}</span>
                      {t.status === 'completed' && (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                        </span>
                      )}
                      {t.status === 'cancelled' && (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-0.5">
                          <XCircle className="h-3.5 w-3.5" /> Cancelled
                        </span>
                      )}
                      {t.status === 'skipped' && (
                        <span className="text-amber-600 dark:text-amber-500 font-semibold flex items-center gap-0.5">
                          <AlertCircle className="h-3.5 w-3.5" /> Skipped
                        </span>
                      )}
                      {t.status === 'pending' && (
                        <span className="text-sky-600 dark:text-sky-400 font-semibold">Pending</span>
                      )}
                      {t.status === 'active' && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      <strong>Dept:</strong> {t.department.name} | <strong>Date:</strong> {formatDateTime12(t.appointment_time)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      <strong>Symptoms:</strong> {t.symptoms}
                    </p>
                    {t.consultation_notes && (
                      <div className="bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg text-[11px] text-slate-600 dark:text-slate-355">
                        <strong>Doctor Notes:</strong> {t.consultation_notes}
                      </div>
                    )}
                    {t.status === 'completed' && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleDownloadPDF(t.id, t.token_number)}
                          className="text-xs text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Download Prescription PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Payment Selection & Summary Modal */}
      {showPaymentModal && paymentBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-md w-full shadow-2xl space-y-6 animate-slide-up">
            
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-850">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Checkout & Booking Summary</h3>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-300"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {paymentError && (
              <div className="bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/50 text-red-755 dark:text-red-455 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Standard Summary Section */}
            <div className="space-y-3.5 text-sm bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-850">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Department</span>
                <span className="font-semibold text-slate-850 dark:text-slate-200">
                  {departments.find(d => d.id === deptId)?.name || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Doctor</span>
                <span className="font-semibold text-slate-850 dark:text-slate-200">
                  {doctorsList.find(doc => doc.id === selectedDoctorId)?.name || "General Pool (Any Doctor)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Consultation Fee</span>
                <span className="font-semibold text-slate-800 dark:text-white">
                  ₹{paymentBreakdown.consultation_fee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">GST Taxes (18%)</span>
                <span className="font-semibold text-slate-800 dark:text-white">
                  ₹{paymentBreakdown.taxes.toFixed(2)}
                </span>
              </div>
              <div className="border-t pt-3 border-slate-200 dark:border-slate-800 flex justify-between items-center font-bold">
                <span className="text-sky-800 dark:text-sky-400 text-xs">Total Amount</span>
                <span className="text-sky-600 dark:text-sky-400 text-base">
                  ₹{paymentBreakdown.total_amount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method Display */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">SELECT PAYMENT METHOD</label>
              <div className="p-3.5 rounded-2xl border border-purple-500/50 bg-purple-50/40 dark:bg-purple-950/20 text-left flex flex-col justify-between h-20 transition">
                <span className="text-xs font-black text-slate-850 dark:text-white flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span>Pay at Counter</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Pay cash/card at hospital reception</span>
              </div>
            </div>

            {/* Workflow Note & Submit */}
            <div className="space-y-4 pt-2">
              <div className="bg-purple-50/40 dark:bg-purple-950/20 p-3.5 rounded-2xl text-[11px] text-slate-600 dark:text-slate-350 leading-relaxed border border-purple-100 dark:border-purple-900/30">
                ⚡ <strong>Immediate Booking</strong>: Booking this consultation will generate your queue token right away. Please complete the payment of <strong>₹{paymentBreakdown.total_amount.toFixed(2)}</strong> at the hospital reception before your consultation.
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingPayment}
                  onClick={handleCounterSubmit}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 shadow-md disabled:opacity-50"
                >
                  {submittingPayment ? "Booking..." : "Confirm & Book Appointment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PatientDashboard;
