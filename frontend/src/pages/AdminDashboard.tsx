import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, Activity, PlusCircle, Trash2, ShieldCheck, 
  MapPin, Settings, AlertCircle, Building2, BarChart3, CheckCircle, ListPlus, FileText,
  CreditCard, DollarSign
} from 'lucide-react';
import { ReportHistory } from '../components/ReportHistory';
import { DashboardMetrics, Department, DoctorFull, PatientFull } from '../types';
import { useToast } from '../context/ToastContext';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { formatDateTime12 } from '../utils/formatTime';

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<DoctorFull[]>([]);
  const [patients, setPatients] = useState<PatientFull[]>([]);
  const [paymentDashboard, setPaymentDashboard] = useState<any>(null);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [adminRemarks, setAdminRemarks] = useState<{ [key: number]: string }>({});
  const [actioningPaymentId, setActioningPaymentId] = useState<number | null>(null);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'Counter'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  // New Department Form
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [newDeptTime, setNewDeptTime] = useState(15);
  const [deptSuccess, setDeptSuccess] = useState(false);

  // Edit Doctor Selection
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editDeptId, setEditDeptId] = useState<number>(0);
  const [editSpecialization, setEditSpecialization] = useState('');
  const [editRoom, setEditRoom] = useState('');

  const fetchAdminData = async () => {
    try {
      const [metricsRes, deptsRes, docsRes, patientsRes, payDashRes, pendingRes] = await Promise.all([
        axios.get('/admin/metrics'),
        axios.get('/queue/departments'),
        axios.get('/admin/doctors'),
        axios.get('/admin/patients'),
        axios.get('/payments/admin/dashboard'),
        axios.get('/payments/admin/pending')
      ]);

      setMetrics(metricsRes.data);
      setDepartments(deptsRes.data);
      setDoctors(docsRes.data);
      setPatients(patientsRes.data);
      setPaymentDashboard(payDashRes.data);
      setPendingPayments(pendingRes.data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch administrator console parameters.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePayment = async (paymentId: number) => {
    setActioningPaymentId(paymentId);
    try {
      const formData = new FormData();
      if (adminRemarks[paymentId]) {
        formData.append("remarks", adminRemarks[paymentId]);
      }
      await axios.post(`/payments/${paymentId}/approve`, formData);
      showToast("Payment approved successfully!", "success");
      fetchAdminData();
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Approval failed.", "error");
    } finally {
      setActioningPaymentId(null);
    }
  };

  const handleRejectPayment = async (paymentId: number) => {
    setActioningPaymentId(paymentId);
    try {
      const formData = new FormData();
      if (adminRemarks[paymentId]) {
        formData.append("remarks", adminRemarks[paymentId]);
      }
      await axios.post(`/payments/${paymentId}/reject`, formData);
      showToast("Payment rejected successfully.", "info");
      fetchAdminData();
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Rejection failed.", "error");
    } finally {
      setActioningPaymentId(null);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await axios.post('/admin/departments', {
        name: newDeptName,
        description: newDeptDesc,
        average_consultation_time: newDeptTime
      });
      setDepartments(prev => [...prev, res.data]);
      setNewDeptName('');
      setNewDeptDesc('');
      setNewDeptTime(15);
      setDeptSuccess(true);
      setTimeout(() => setDeptSuccess(false), 3000);
      showToast("Department registered successfully.", "success");
      
      // Refresh metrics loads
      const mRes = await axios.get('/admin/metrics');
      setMetrics(mRes.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create department.');
      showToast(err.response?.data?.detail || 'Failed to create department.', "error");
    }
  };

  const handleDeleteDept = async (id: number) => {
    if (!window.confirm('Deleting this department will clear all affiliated queue tokens. Proceed?')) return;
    setError(null);
    try {
      await axios.delete(`/admin/departments/${id}`);
      setDepartments(prev => prev.filter(d => d.id !== id));
      showToast("Department deleted successfully.", "info");
      
      // Refresh metrics & doctors list
      const [mRes, docsRes] = await Promise.all([
        axios.get('/admin/metrics'),
        axios.get('/admin/doctors')
      ]);
      setMetrics(mRes.data);
      setDoctors(docsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not delete department.');
      showToast(err.response?.data?.detail || 'Could not delete department.', "error");
    }
  };

  const startEditDoctor = (doc: DoctorFull) => {
    setEditingDocId(doc.id);
    setEditDeptId(doc.department_id || 0);
    setEditSpecialization(doc.specialization || '');
    setEditRoom(doc.room_number || '');
  };

  const handleUpdateDoctor = async (id: number) => {
    setError(null);
    try {
      const res = await axios.put(`/admin/doctors/${id}`, {
        department_id: editDeptId || undefined,
        specialization: editSpecialization,
        room_number: editRoom
      });
      setDoctors(prev => prev.map(d => d.id === id ? res.data : d));
      setEditingDocId(null);
      showToast("Doctor assignment updated successfully.", "success");
      
      // Refresh metrics in case patient load distributes
      const mRes = await axios.get('/admin/metrics');
      setMetrics(mRes.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update doctor profile.');
      showToast(err.response?.data?.detail || 'Failed to update doctor profile.', "error");
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-pulse">
        <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
            <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          </div>
          <div className="space-y-6">
            <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* Console Welcome */}
      <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-emerald-500/10 to-indigo-500/10 animate-slide-up hover-lift">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-emerald-600" />
            <span>Administrator Console</span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Configure clinic divisions, map clinicians, and audit hospital throughput metrics.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/50 text-red-750 dark:text-red-455 p-4 rounded-2xl animate-alert-slide-down">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Total Patients Registered', value: metrics.total_patients, suffix: '', icon: Users, color: 'text-indigo-600 bg-indigo-500/10' },
            { label: 'Clinicians Available', value: metrics.total_doctors, suffix: '', icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-500/10' },
            { label: 'Tokens Generated Today', value: metrics.total_tokens_today, suffix: '', icon: Activity, color: 'text-sky-600 bg-sky-500/10' },
            { label: 'Average Wait Time', value: metrics.average_wait_time, suffix: 'm', icon: BarChart3, color: 'text-amber-600 bg-amber-500/10' }
          ].map((card, idx) => (
            <div key={idx} className="glass rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between animate-slide-up hover-lift">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase leading-none block">
                  {card.label}
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-white block">
                  <AnimatedCounter value={card.value} suffix={card.suffix} />
                </span>
              </div>
              <div className={`p-3 rounded-2xl ${card.color} transition-all duration-300 hover:rotate-12`}>
                <card.icon className="h-6 w-6" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary Configuration Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Department List and creation */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Department load weights */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift">
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5 mb-6">
              <Building2 className="h-5 w-5 text-indigo-600" />
              <span>Department Loads & Waiting Indexes</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departments.map(dept => {
                const liveLoad = metrics?.department_loads.find(l => l.name === dept.name);
                return (
                  <div key={dept.id} className="p-4 border border-slate-200 dark:border-slate-850 rounded-2xl flex justify-between items-center relative overflow-hidden bg-slate-50/20 dark:bg-slate-900/10 hover:bg-slate-50 dark:hover:bg-slate-900 transition animate-fade-in">
                    <div className="space-y-1">
                      <p className="font-extrabold text-sm text-slate-800 dark:text-white">{dept.name}</p>
                      <p className="text-xs text-slate-500 mb-1">Wait: ~{liveLoad?.avg_wait || 0}m</p>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-400 font-medium">Fee:</span>
                        <input
                          type="number"
                          value={dept.consultation_fee || 500}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, consultation_fee: val } : d));
                          }}
                          onBlur={async (e) => {
                            const val = Number(e.target.value);
                            try {
                              await axios.put(`/admin/departments/${dept.id}`, {
                                consultation_fee: val
                              });
                              showToast(`Consultation fee for ${dept.name} updated to ₹${val}`, "success");
                            } catch (err) {
                              showToast("Failed to update consultation fee.", "error");
                            }
                          }}
                          className="w-16 p-0.5 px-1 border border-slate-300 dark:border-slate-800 rounded bg-white dark:bg-slate-900 text-center font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 text-[11px]"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-400 uppercase leading-none block">Active</span>
                        <span className="text-lg font-extrabold text-slate-700 dark:text-slate-200">
                          {liveLoad?.active_count || 0}
                        </span>
                      </div>
                      <button 
                        onClick={() => handleDeleteDept(dept.id)}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-955/20 transition"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clinicians configuration panel */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto animate-slide-up hover-lift">
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5 mb-6">
              <Users className="h-5 w-5 text-sky-600" />
              <span>Clinicians Mapping Deck</span>
            </h2>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                  <th className="py-3 px-2 font-bold">Doctor</th>
                  <th className="py-3 px-2 font-bold">Department</th>
                  <th className="py-3 px-2 font-bold">Specialization</th>
                  <th className="py-3 px-2 font-bold">Room</th>
                  <th className="py-3 px-2 font-bold">Availability</th>
                  <th className="py-3 px-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {doctors.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/10">
                    <td className="py-3 px-2 font-bold text-slate-900 dark:text-white">{doc.user.name}</td>
                    <td className="py-3 px-2">
                      {editingDocId === doc.id ? (
                        <select
                          value={editDeptId}
                          onChange={(e) => setEditDeptId(Number(e.target.value))}
                          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1"
                        >
                          <option value={0}>Unassigned</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      ) : (
                        departments.find(d => d.id === doc.department_id)?.name || 'Unassigned'
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingDocId === doc.id ? (
                        <input
                          type="text"
                          value={editSpecialization}
                          onChange={(e) => setEditSpecialization(e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1 w-28"
                        />
                      ) : (
                        doc.specialization || 'General'
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingDocId === doc.id ? (
                        <input
                          type="text"
                          value={editRoom}
                          onChange={(e) => setEditRoom(e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1 w-20"
                        />
                      ) : (
                        doc.room_number || 'N/A'
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        doc.is_available 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {doc.is_available ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      {editingDocId === doc.id ? (
                        <button
                          onClick={() => handleUpdateDoctor(doc.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded text-[10px]"
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          onClick={() => startEditDoctor(doc)}
                          className="text-sky-600 hover:text-sky-700 font-bold"
                        >
                          Modify
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

        {/* Right Column: Create Department Form & patient index */}
        <div className="space-y-6">
          
          {/* Create Division */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift">
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5 mb-6">
              <ListPlus className="h-5 w-5 text-indigo-600" />
              <span>Create Department</span>
            </h2>

            {deptSuccess && (
              <div className="mb-4 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-450 p-2.5 rounded-xl text-xs">
                <CheckCircle className="h-4 w-4" />
                <span>Department registered successfully.</span>
              </div>
            )}

            <form onSubmit={handleCreateDept} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-650 dark:text-slate-350 mb-1">
                  Department Name
                </label>
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="e.g. Ophthalmology, Dermatology"
                  className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-650 dark:text-slate-350 mb-1">
                  Consultation Duration Benchmark (minutes)
                </label>
                <input
                  type="number"
                  required
                  value={newDeptTime}
                  onChange={(e) => setNewDeptTime(Number(e.target.value))}
                  placeholder="e.g. 15"
                  className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-655 dark:text-slate-355 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Map division functions, priority policies..."
                  className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 rounded-xl text-xs transition shadow-sm"
              >
                Register Department
              </button>
            </form>
          </div>

          {/* Patients Listing */}
          <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm max-h-[350px] overflow-y-auto animate-slide-up hover-lift">
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5 mb-6">
              <Users className="h-5 w-5 text-emerald-600" />
              <span>Auditable Patients Index</span>
            </h2>

            <div className="space-y-3">
              {patients.map(pat => (
                <div key={pat.id} className="p-3 border border-slate-200/50 dark:border-slate-850 rounded-xl space-y-1 text-xs">
                  <div className="flex justify-between items-center font-bold text-slate-800 dark:text-white">
                    <span>{pat.user.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{pat.blood_group || 'N/A'} blood group</span>
                  </div>
                  <p className="text-[10px] text-slate-500">Email: {pat.user.email} | DOB: {pat.date_of_birth || 'N/A'}</p>
                  {pat.medical_history && (
                    <p className="text-[10px] bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded text-slate-600 line-clamp-1">
                      <strong>Notes:</strong> {pat.medical_history}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Medical Reports Auditor */}
      <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
          <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span>Hospital Medical Reports Auditor</span>
        </h2>
        <ReportHistory mode="admin" />
      </div>

      {/* Secure Payment Management Panel */}
      {paymentDashboard && (
        <div className="glass rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm animate-slide-up hover-lift space-y-6">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-4">
            <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-450" />
            <span>Clinic Payment & Revenue Management</span>
          </h2>          {/* Payment Verification Deck */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-350 flex items-center gap-1.5">
              <span>Pending Payment Verifications</span>
              {pendingPayments.length > 0 && (
                <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-450 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {pendingPayments.length} Action Needed
                </span>
              )}
            </h3>

            {/* Search and Filter Inputs */}
            <div className="flex flex-col sm:flex-row gap-4 p-4 bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-150 dark:border-slate-850">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search by Patient Name, Receipt or UTR number..."
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentFilter('ALL')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    paymentFilter === 'ALL'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/40'
                  }`}
                >
                  All
                </button>
              </div>
            </div>

            {(() => {
              const filteredPayments = pendingPayments.filter((pay: any) => {
                if (paymentFilter !== 'ALL' && pay.payment_method !== paymentFilter) return false;
                if (paymentSearch.trim() !== '') {
                  const q = paymentSearch.toLowerCase();
                  const patName = pay.patient_name?.toLowerCase() || '';
                  const receipt = pay.receipt_number?.toLowerCase() || '';
                  const utr = pay.utr_number?.toLowerCase() || '';
                  if (!patName.includes(q) && !receipt.includes(q) && !utr.includes(q)) return false;
                }
                return true;
              });

              if (filteredPayments.length === 0) {
                return (
                  <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/20 dark:bg-slate-900/10">
                    <p className="text-xs text-slate-550">No pending verification transactions found matching filter.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredPayments.map((pay: any) => (
                    <div key={pay.id} className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm bg-white dark:bg-slate-900/40">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                            Receipt {pay.receipt_number} | Patient: {pay.patient_name || 'N/A'}
                          </span>
                          <div className="text-xs font-bold text-slate-800 dark:text-white mt-0.5">
                            Amount: <span className="text-sky-600 dark:text-sky-400 font-extrabold text-sm">₹{pay.amount.toFixed(2)}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold border bg-purple-50 dark:bg-purple-955/20 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/30">
                          PAY AT COUNTER
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl text-[11px] border border-slate-100 dark:border-slate-850 italic text-slate-500">
                        Counter Payment: Settle payment cash/card and update patient status directly at reception.
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Admin Remarks (Optional)</label>
                        <input
                          type="text"
                          placeholder="Add verification notes, receipt confirmation number..."
                          value={adminRemarks[pay.id] || ""}
                          onChange={(e) => setAdminRemarks({ ...adminRemarks, [pay.id]: e.target.value })}
                          className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actioningPaymentId !== null}
                          onClick={() => handleApprovePayment(pay.id)}
                          className="flex-1 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                        >
                          Confirm Counter Payment
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Payment Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
            <div className="bg-slate-50/60 dark:bg-slate-900/20 p-5 rounded-2xl border border-slate-150 dark:border-slate-850 flex flex-col justify-between hover:scale-[1.02] transition shadow-sm">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500 mb-1">Today's Revenue</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">₹{paymentDashboard.today_revenue.toFixed(2)}</span>
            </div>
            <div className="bg-slate-50/60 dark:bg-slate-900/20 p-5 rounded-2xl border border-slate-150 dark:border-slate-850 flex flex-col justify-between hover:scale-[1.02] transition shadow-sm">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500 mb-1">Monthly Revenue</span>
              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">₹{paymentDashboard.monthly_revenue.toFixed(2)}</span>
            </div>
            <div className="bg-slate-50/60 dark:bg-slate-900/20 p-5 rounded-2xl border border-slate-150 dark:border-slate-850 flex flex-col justify-between hover:scale-[1.02] transition shadow-sm">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500 mb-1">Successful Payments</span>
              <span className="text-2xl font-black text-slate-850 dark:text-white">{paymentDashboard.successful_payments}</span>
            </div>
            <div className="bg-slate-50/60 dark:bg-slate-900/20 p-5 rounded-2xl border border-slate-150 dark:border-slate-850 flex flex-col justify-between hover:scale-[1.02] transition shadow-sm">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500 mb-1">Failed Payments</span>
              <span className="text-2xl font-black text-red-500">{paymentDashboard.failed_payments}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Revenue by Department */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-350">Revenue by Division</h3>
              <div className="space-y-2">
                {paymentDashboard.revenue_by_department.map((dept: any, idx: number) => (
                  <div key={idx} className="p-3 border border-slate-205/60 dark:border-slate-850 rounded-xl flex justify-between items-center text-xs">
                    <span className="font-extrabold text-slate-800 dark:text-white">{dept.name}</span>
                    <span className="font-black text-sky-600 dark:text-sky-400">₹{dept.revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-350">Audit Trails (Recent Transactions)</h3>
              {paymentDashboard.recent_transactions.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No payment events logged.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-bold">
                        <th className="py-2 px-1">Date</th>
                        <th className="py-2 px-1">Patient</th>
                        <th className="py-2 px-1">Division/Doctor</th>
                        <th className="py-2 px-1">Method</th>
                        <th className="py-2 px-1">Amount</th>
                        <th className="py-2 px-1 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                      {paymentDashboard.recent_transactions.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/10">
                          <td className="py-2 px-1">
                            {formatDateTime12(tx.created_time)}
                          </td>
                          <td className="py-2 px-1 font-semibold">{tx.patient_name}</td>
                          <td className="py-2 px-1 text-slate-500">
                            {tx.department} ({tx.doctor || "Any"})
                          </td>
                          <td className="py-2 px-1 uppercase font-bold text-slate-505">{tx.payment_method}</td>
                          <td className="py-2 px-1 font-bold">₹{tx.amount.toFixed(2)}</td>
                          <td className="py-2 px-1 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              (tx.status === 'Paid' || tx.status === 'Verified')
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30'
                                : tx.status === 'Rejected'
                                ? 'bg-red-50 dark:bg-red-955/20 text-red-655 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                                : tx.status === 'Pending at Counter'
                                ? 'bg-purple-50 dark:bg-purple-955/20 text-purple-650 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30'
                                : 'bg-amber-50 dark:bg-amber-955/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
export default AdminDashboard;
