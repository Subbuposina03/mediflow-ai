import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ReportHistory } from '../components/ReportHistory';
import { 
  Users, CheckCircle2, ChevronRight, UserMinus, AlertTriangle, 
  Settings, User, FileText, CheckCircle, BrainCircuit, RefreshCw, AlertCircle
} from 'lucide-react';
import { QueueTokenDetailed, DoctorProfile } from '../types';
import { useToast } from '../context/ToastContext';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { formatDateTime12 } from '../utils/formatTime';

export const DoctorDashboard: React.FC = () => {
  const { user } = useAuth();
  const { subscribe, unsubscribe, lastMessage } = useSocket();
  const { showToast } = useToast();

  // Profiles and dashboard lists
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [activeToken, setActiveToken] = useState<QueueTokenDetailed | null>(null);
  const [pendingQueue, setPendingQueue] = useState<any[]>([]);
  const [history, setHistory] = useState<QueueTokenDetailed[]>([]);
  const [patientSummary, setPatientSummary] = useState<string>('');
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Notes
  const [consultationNotes, setConsultationNotes] = useState('');
  const [draftingPrescription, setDraftingPrescription] = useState(false);

  // Fetch initial configuration
  const fetchDashboardData = async () => {
    try {
      const [profileRes, activeTokenRes, historyRes] = await Promise.all([
        axios.get('/doctors/profile'),
        axios.get('/doctors/active-token'),
        axios.get('/doctors/history')
      ]);

      setProfile(profileRes.data);
      setActiveToken(activeTokenRes.data);
      setHistory(historyRes.data);

      if (profileRes.data.department_id) {
        // Load initially live queue from rest endpoint
        const liveQueue = await axios.get(`/queue/departments/${profileRes.data.department_id}/live`);
        setPendingQueue(liveQueue.data.pending || []);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to load clinic data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // WebSockets Subscription
  useEffect(() => {
    if (profile?.department_id) {
      subscribe(profile.department_id);
    }
    return () => unsubscribe();
  }, [profile?.department_id]);

  // Listen to WebSocket broadcasts
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'queue_update' && profile) {
      if (lastMessage.department_id === profile.department_id) {
        setPendingQueue(lastMessage.pending || []);
        
        // If an active token is resolved by the socket, update its details
        const activeList = lastMessage.active || [];
        const isCurrentActive = activeList.find((a: any) => a.id === activeToken?.id);
        if (!isCurrentActive && activeToken) {
          // If our token is no longer in the active list (e.g. cancelled by patient/admin)
          setActiveToken(null);
        }
      }
    }
  }, [lastMessage, profile?.department_id, activeToken?.id]);

  // AI Patient Summary Fetcher
  const fetchPatientAISummary = async () => {
    if (!activeToken) {
      setPatientSummary('');
      return;
    }
    setSummaryLoading(true);
    try {
      const res = await axios.get(`/doctors/patient-summary/${activeToken.patient_id}`);
      setPatientSummary(res.data.summary);
      showToast("AI Clinical Assessment generated successfully.", "success");
    } catch (err) {
      setPatientSummary('Unable to extract clinical parameters.');
      showToast("Could not generate clinical assessment.", "error");
    } finally {
      setSummaryLoading(false);
    }
  };

  // AI Patient Summary Detail Fetcher
  const fetchPatientAIReportSummary = async () => {
    if (!activeToken) {
      setAiSummary(null);
      return;
    }
    setAiSummaryLoading(true);
    try {
      const res = await axios.get(`/doctors/patient-ai-summary/${activeToken.patient_id}`);
      setAiSummary(res.data);
      showToast("Patient health summary synced.", "success");
    } catch (err) {
      console.error(err);
      setAiSummary(null);
      showToast("Failed to retrieve patient health summary.", "error");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // Reset AI summary states when active token changes
  useEffect(() => {
    setPatientSummary('');
    setAiSummary(null);
  }, [activeToken?.id]);

  const toggleAvailability = async () => {
    if (!profile) return;
    try {
      const updatedAvail = !profile.is_available;
      const res = await axios.put(`/doctors/profile?is_available=${updatedAvail}`);
      setProfile(res.data);
      showToast(updatedAvail ? "Availability set to Online." : "Availability set to Offline.", "info");
    } catch (err) {
      showToast('Failed to update availability status.', "error");
    }
  };

  const handleCallNext = async () => {
    setError(null);
    setActionLoading(true);
    try {
      const res = await axios.post('/doctors/call-next');
      setActiveToken(res.data);
      setConsultationNotes('');
      // Refresh history records
      const hist = await axios.get('/doctors/history');
      setHistory(hist.data);
      showToast("Next patient called to consulting chamber.", "success");
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error retrieving next patient.');
      showToast(err.response?.data?.detail || 'Error retrieving next patient.', "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeToken) return;
    setError(null);
    setActionLoading(true);
    try {
      await axios.post(`/doctors/complete?token_id=${activeToken.id}`, {
        status: 'completed',
        consultation_notes: consultationNotes
      });
      setActiveToken(null);
      setConsultationNotes('');
      
      // Refresh histories
      const [histRes, liveRes] = await Promise.all([
        axios.get('/doctors/history'),
        axios.get(`/queue/departments/${profile?.department_id}/live`)
      ]);
      setHistory(histRes.data);
      setPendingQueue(liveRes.data.pending || []);
      showToast("Consultation completed and saved.", "success");
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to close consultation token.');
      showToast(err.response?.data?.detail || 'Failed to close consultation token.', "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!activeToken) return;
    if (!window.confirm('Mark this patient as skipped? They will be removed from current active queue.')) return;
    setError(null);
    setActionLoading(true);
    try {
      await axios.post(`/doctors/skip?token_id=${activeToken.id}`);
      setActiveToken(null);
      setConsultationNotes('');
      
      const [histRes, liveRes] = await Promise.all([
        axios.get('/doctors/history'),
        axios.get(`/queue/departments/${profile?.department_id}/live`)
      ]);
      setHistory(histRes.data);
      setPendingQueue(liveRes.data.pending || []);
      showToast("Patient marked as skipped.", "info");
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to skip token.');
      showToast(err.response?.data?.detail || 'Failed to skip token.', "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDraftPrescription = async () => {
    if (!activeToken) return;
    setDraftingPrescription(true);
    try {
      const res = await axios.post(`/doctors/consultations/${activeToken.id}/draft-prescription`, {
        diagnosis: consultationNotes
      });
      const draftText = res.data.draft;
      if (consultationNotes) {
        setConsultationNotes(prev => `${prev}\n\n${draftText}`);
      } else {
        setConsultationNotes(draftText);
      }
      showToast("AI drafted prescription appended.", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.detail || "Could not generate prescription draft.", "error");
    } finally {
      setDraftingPrescription(false);
    }
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
      showToast("Consultation history log exported.", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Could not export consultation history.", "error");
    }
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
      {/* Clinician Header */}
      <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 mb-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-indigo-500/10 to-sky-500/10 animate-slide-up hover-lift">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {user?.name || 'Dr. Practitioner'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Clinic: {profile?.room_number || 'N/A'} | Specialization: {profile?.specialization || 'General Consultation'}
          </p>
        </div>
        
        {/* Availability Toggle */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase pl-1.5">
            Availability:
          </span>
          <button
            onClick={toggleAvailability}
            className={`px-4 py-1.5 rounded-xl font-bold text-xs transition duration-300 ${
              profile?.is_available 
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20' 
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {profile?.is_available ? 'Active' : 'Offline'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-755 dark:text-red-450 p-4 rounded-2xl">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Control Deck Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Columns: Current Patient Workspace */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Patient workspace */}
          {activeToken ? (
            <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 animate-slide-up hover-lift">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-850">
                <div>
                  <span className="text-xs font-bold uppercase bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 px-3 py-1 rounded-full">
                    Active Consultation
                  </span>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                    {activeToken.patient.user.name}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 dark:text-slate-500 font-medium">Method:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {activeToken.payment?.payment_method || 'Seeded'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 dark:text-slate-500 font-medium">Status:</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        activeToken.payment
                          ? (activeToken.payment.payment_status === 'Paid' || activeToken.payment.payment_status === 'Verified')
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30'
                            : activeToken.payment.payment_status === 'Rejected'
                            ? 'bg-red-50 dark:bg-red-955/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                            : activeToken.payment.payment_status === 'Pending at Counter'
                            ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-650 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30'
                            : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-450 border border-amber-100 dark:border-amber-900/30'
                          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450'
                      }`}>
                        {activeToken.payment ? activeToken.payment.payment_status : 'Paid'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-400 uppercase">Token Number</p>
                  <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{activeToken.token_number}</p>
                </div>
              </div>

              {/* Symptoms & AI summaries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="h-4.5 w-4.5 text-indigo-650" />
                    <span>Reported Symptoms</span>
                  </h3>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-850 text-sm text-slate-655 dark:text-slate-350">
                    {activeToken.symptoms || 'No symptoms detailed.'}
                  </div>
                </div>

                {/* AI Health Check Card */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-330 flex items-center gap-1.5">
                    <BrainCircuit className="h-4.5 w-4.5 text-sky-500" />
                    <span>AI Clinical Assessment</span>
                  </h3>
                  <div className="p-4 rounded-2xl bg-sky-500/5 dark:bg-sky-500/5 border border-sky-200/30 dark:border-sky-850 text-sm text-slate-655 dark:text-slate-350 flex flex-col justify-between">
                    {summaryLoading ? (
                      <div className="flex justify-center items-center h-20">
                        <RefreshCw className="h-5 w-5 animate-spin text-sky-500" />
                      </div>
                    ) : patientSummary ? (
                      <p className="leading-relaxed text-xs">{patientSummary}</p>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-2 gap-1 text-center">
                        <p className="text-[10px] text-slate-400">Clinical assessment is available.</p>
                        <button
                          type="button"
                          onClick={fetchPatientAISummary}
                          className="bg-sky-600 hover:bg-sky-700 text-white text-[9px] font-bold px-2 py-1 rounded-lg transition flex items-center gap-1"
                        >
                          <BrainCircuit className="h-3 w-3" />
                          <span>Generate Assessment</span>
                        </button>
                      </div>
                    )}
                    
                    <div className="mt-2.5 pt-2.5 border-t border-sky-100 dark:border-sky-955/20 flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-500">Health Priority Index:</span>
                      <span className="font-extrabold text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-955 px-2 py-0.5 rounded">
                        {activeToken.priority_score}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Patient Medical Reports */}
                <div className="space-y-3 lg:col-span-2">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 font-sans">
                    <FileText className="h-4.5 w-4.5 text-indigo-500" />
                    <span>Patient Medical Reports</span>
                  </h3>
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-sm max-h-[300px] overflow-y-auto">
                    <ReportHistory mode="doctor" patientId={activeToken.patient_id} />
                  </div>
                </div>
              </div>

              {/* AI Patient Summary Panel */}
              <div className="border border-indigo-100 dark:border-indigo-950 bg-indigo-50/5 dark:bg-indigo-950/20 rounded-3xl p-6 space-y-6">
                <h3 className="text-sm font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5 pb-3 border-b border-indigo-100 dark:border-indigo-950">
                  <BrainCircuit className="h-5 w-5 text-indigo-650 dark:text-indigo-400" />
                  <span>AI Patient Summary</span>
                </h3>

                {aiSummaryLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
                    <p className="text-xs text-slate-500">Synthesizing clinical summary parameters...</p>
                  </div>
                ) : aiSummary ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    
                    {/* Left Column */}
                    <div className="space-y-4">
                      
                      {/* Patient Information */}
                      <div className="space-y-1">
                        <h4 className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Patient Information</h4>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
                          <p><strong>Name:</strong> {aiSummary.patient_info?.name}</p>
                          <p><strong>Age:</strong> {aiSummary.patient_info?.age}</p>
                          <p><strong>Gender:</strong> {aiSummary.patient_info?.gender}</p>
                          <p><strong>Blood Group:</strong> {aiSummary.patient_info?.blood_group}</p>
                        </div>
                      </div>

                      {/* Medical History */}
                      <div className="space-y-1">
                        <h4 className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Medical History</h4>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
                          <p><strong>Chronic Conditions:</strong> {aiSummary.medical_history?.chronic_diseases || "No previous medical history available."}</p>
                          <p><strong>Allergies:</strong> {aiSummary.medical_history?.allergies || "None reported"}</p>
                          <p><strong>Previous Diagnoses:</strong> {aiSummary.medical_history?.previous_diagnoses || "None reported"}</p>
                        </div>
                      </div>

                      {/* Current Visit */}
                      <div className="space-y-1">
                        <h4 className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Current Visit</h4>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
                          <p><strong>Symptoms:</strong> {aiSummary.current_visit?.symptoms}</p>
                          <p><strong>Risk Level:</strong> {aiSummary.current_visit?.risk_level}</p>
                          <p><strong>Health Advice:</strong> {aiSummary.current_visit?.triage_advice}</p>
                        </div>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                      
                      {/* Previous Prescriptions */}
                      <div className="space-y-1">
                        <h4 className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Previous Prescriptions</h4>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                          {aiSummary.previous_prescriptions && aiSummary.previous_prescriptions.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                              {aiSummary.previous_prescriptions.map((p: string, idx: number) => (
                                <li key={idx} className="truncate">{p}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-slate-500 italic">No historical prescriptions found.</p>
                          )}
                        </div>
                      </div>

                      {/* Medical Reports */}
                      <div className="space-y-1">
                        <h4 className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Medical Reports</h4>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
                          <p><strong>Uploaded Files Count:</strong> {aiSummary.medical_reports?.count}</p>
                          <p><strong>Clinical Findings:</strong> {aiSummary.medical_reports?.findings_summary}</p>
                        </div>
                      </div>

                      {/* Risk Assessment */}
                      <div className="space-y-1">
                        <h4 className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Risk Assessment</h4>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 flex items-center gap-3">
                          <span className={`px-3 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                            aiSummary.risk_assessment === 'High' ? 'bg-rose-100 text-rose-700' :
                            aiSummary.risk_assessment === 'Medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {aiSummary.risk_assessment} Risk
                          </span>
                        </div>
                      </div>

                      {/* AI Recommendations */}
                      <div className="space-y-1">
                        <h4 className="font-bold uppercase tracking-wider text-[10px] text-slate-400">AI Recommendations</h4>
                        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                          <ul className="list-disc list-inside space-y-1 text-indigo-600 dark:text-indigo-400">
                            {aiSummary.ai_recommendation?.map((rec: string, idx: number) => (
                              <li key={idx} className="font-semibold">{rec}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                    <p className="text-xs text-slate-500">A detailed summary of patient records, demographics, and clinical timeline is available.</p>
                    <button
                      type="button"
                      onClick={fetchPatientAIReportSummary}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow"
                    >
                      <BrainCircuit className="h-4 w-4" />
                      <span>Generate AI Patient Summary</span>
                    </button>
                  </div>
                )}
              </div>

              {/* consultation notes input form */}
              <form onSubmit={handleComplete} className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-850">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-350">
                      Consultation Clinical Notes
                    </label>
                    <button
                      type="button"
                      onClick={handleDraftPrescription}
                      disabled={draftingPrescription}
                      className="text-xs text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1 bg-sky-50 dark:bg-sky-955/40 px-2.5 py-1 rounded-lg transition"
                    >
                      {draftingPrescription ? "Drafting..." : "Draft Prescription with AI"}
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={consultationNotes}
                    onChange={(e) => setConsultationNotes(e.target.value)}
                    placeholder="Enter diagnosis, clinical actions, prescriptions, and follow-up guidance..."
                    className="w-full p-3 rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="h-4.5 w-4.5" />
                    <span>Complete Consultation</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={actionLoading}
                    className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-955/20 dark:hover:bg-amber-900/30 text-amber-800 dark:text-amber-400 font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                  >
                    <UserMinus className="h-4.5 w-4.5" />
                    <span>Skip Patient</span>
                  </button>
                </div>
              </form>

            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900/40 rounded-3xl p-12 border border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-4 animate-slide-up hover-lift">
              <div className="bg-sky-500/10 p-4 rounded-2xl text-sky-600 dark:text-sky-400">
                <Users className="h-8 w-8" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className="text-lg font-black text-slate-850 dark:text-white">Workspace Idle</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  No patient is currently called. Set your availability status to Active and trigger the next token from the department queue.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCallNext}
                disabled={actionLoading || !profile?.is_available}
                className="bg-sky-600 hover:bg-sky-750 disabled:bg-slate-350 dark:disabled:bg-slate-800 disabled:text-slate-500 disabled:pointer-events-none text-white font-bold px-6 py-2.5 rounded-xl transition shadow text-xs"
              >
                Call Next Patient
              </button>
            </div>
          )}

        </div>

        {/* Right Column: Live Pending list & histories */}
        <div className="space-y-6">
          
          {/* Live Pending Queue */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm max-h-[380px] overflow-y-auto animate-slide-up hover-lift">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users className="h-5 w-5 text-sky-600" />
                <span>Department Queue</span>
              </h2>
              <span className="text-[10px] uppercase font-black bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded text-slate-500">
                <AnimatedCounter value={pendingQueue.length} /> waiting
              </span>
            </div>

            {pendingQueue.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-450 text-xs">No pending patients in line.</p>
            ) : (
              <div className="space-y-3">
                {pendingQueue.map((p, idx) => (
                  <div key={p.id} className="flex justify-between items-center p-3 border border-slate-200/60 dark:border-slate-850 rounded-xl text-xs hover:bg-sky-500/5 dark:hover:bg-sky-500/5 hover:translate-x-1 transition-all duration-200">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-400">#{idx + 1}</span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{p.patient_name}</p>
                        <p className="text-[10px] text-slate-400">Wait: ~{p.predicted_wait_time}m</p>
                      </div>
                    </div>
                    <span className="font-extrabold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded">
                      {p.token_number}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session History */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm max-h-[380px] overflow-y-auto animate-slide-up hover-lift">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Consultations History</span>
              </h2>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="text-xs text-sky-600 hover:text-sky-700 font-bold bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg transition"
                >
                  Export CSV
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-450 text-xs">No patients processed today.</p>
            ) : (
              <div className="space-y-4">
                {history.map(h => (
                  <div key={h.id} className="p-3 border border-slate-200/60 dark:border-slate-850 rounded-xl space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                        {h.patient.user.name}
                        <span className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-slate-400 font-medium">
                            {h.payment?.payment_method || 'Seeded'}
                          </span>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            h.payment
                              ? (h.payment.payment_status === 'Paid' || h.payment.payment_status === 'Verified')
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30'
                                : h.payment.payment_status === 'Rejected'
                                ? 'bg-red-50 dark:bg-red-955/20 text-red-650 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                                : h.payment.payment_status === 'Pending at Counter'
                                ? 'bg-purple-50 dark:bg-purple-955/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30'
                                : 'bg-amber-50 dark:bg-amber-955/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30'
                              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450'
                          }`}>
                            {h.payment ? h.payment.payment_status : 'Paid'}
                          </span>
                        </span>
                      </span>
                      <span className={`font-semibold ${h.status === 'completed' ? 'text-emerald-700 dark:text-emerald-450' : 'text-amber-600 dark:text-amber-500'}`}>
                        {h.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span>Token: {h.token_number} | Completed: {formatDateTime12(h.updated_at)}</span>
                      <button
                        type="button"
                        onClick={() => handleDownloadPDF(h.id, h.token_number)}
                        className="text-sky-600 hover:text-sky-750 font-bold"
                      >
                        Prescription PDF
                      </button>
                    </div>
                    {h.consultation_notes && (
                      <p className="text-[11px] bg-slate-50 dark:bg-slate-900/40 p-2 rounded text-slate-500 line-clamp-2">
                        {h.consultation_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
export default DoctorDashboard;
