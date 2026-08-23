import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FileText, Trash2, Download, Eye, UploadCloud, 
  CheckCircle2, AlertCircle, Loader2, BrainCircuit, X
} from 'lucide-react';
import { formatDateTime12 } from '../utils/formatTime';

interface MedicalReport {
  id: number;
  patient_id: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  ai_summary: string;
  created_at: string;
}

interface ReportHistoryProps {
  mode: 'patient' | 'doctor' | 'admin';
  patientId?: number; // Needed for doctor mode
}

export const ReportHistory: React.FC<ReportHistoryProps> = ({ mode, patientId }) => {
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Upload States
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Preview States
  const [previewReport, setPreviewReport] = useState<MedicalReport | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = '/reports/my-reports';
      if (mode === 'doctor' && patientId) {
        endpoint = `/reports/patient/${patientId}`;
      } else if (mode === 'admin') {
        endpoint = '/reports/all';
      }
      const res = await axios.get(endpoint);
      setReports(res.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Could not retrieve medical reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'patient' || (mode === 'doctor' && patientId) || mode === 'admin') {
      fetchReports();
    }
  }, [mode, patientId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    // Client-side validations
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      alert("Invalid file format. Please upload PDF, JPG, JPEG, or PNG files only.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit.");
      return;
    }

    setUploading(true);
    setUploadProgress("Uploading file...");
    setUploadSuccess(false);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('/reports/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setReports(prev => [res.data, ...prev]);
      setUploadSuccess(true);
      setUploadProgress(null);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Upload failed. Try again.");
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (report: MedicalReport) => {
    try {
      const res = await axios.get(`/reports/download/${report.id}`, {
        responseType: 'blob'
      });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: report.mime_type });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', report.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert("Could not download file.");
    }
  };

  const handleDelete = async (reportId: number) => {
    if (!window.confirm("Are you sure you want to delete this report permanently?")) return;
    try {
      await axios.delete(`/reports/${reportId}`);
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || "Delete operation failed.");
    }
  };

  const handlePreview = async (report: MedicalReport) => {
    setPreviewReport(report);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const res = await axios.get(`/reports/download/${report.id}`, {
        responseType: 'blob'
      });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: report.mime_type });
      const url = window.URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err: any) {
      console.error(err);
      alert("Could not load report preview.");
      setPreviewReport(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewReport(null);
    setPreviewUrl(null);
  };

  return (
    <div className="space-y-6">
      {/* Patient Upload Area */}
      {mode === 'patient' && (
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-sky-500 dark:hover:border-sky-400 rounded-3xl p-6 text-center transition bg-white dark:bg-slate-900/50">
          <input
            type="file"
            id="report-upload-input"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.jpg,.jpeg,.png"
          />
          <label htmlFor="report-upload-input" className="cursor-pointer block space-y-3">
            <div className="flex justify-center">
              {uploading ? (
                <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
              ) : (
                <UploadCloud className="h-10 w-10 text-slate-400 hover:text-sky-500 transition" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {uploading ? "Processing medical file..." : "Click to upload medical reports"}
              </p>
              <p className="text-xs text-slate-400 mt-1">Accepts PDF, JPG, JPEG, PNG up to 5MB</p>
            </div>
          </label>

          {uploadProgress && (
            <p className="text-xs text-sky-600 mt-3 font-semibold animate-pulse">{uploadProgress}</p>
          )}

          {uploadSuccess && (
            <div className="mt-3 flex justify-center items-center gap-1.5 text-xs text-emerald-600 font-bold">
              <CheckCircle2 className="h-4 w-4" />
              <span>Report uploaded successfully! AI summary generated.</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/50 text-red-700 p-3 rounded-2xl text-xs">
          <AlertCircle className="h-4.5 w-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reports Table/Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-450 text-xs text-center py-6">No medical reports registered.</p>
      ) : (
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Report History</h3>
          <div className="grid grid-cols-1 gap-3">
            {reports.map(r => (
              <div key={r.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-800 transition">
                <div className="flex gap-3 items-start flex-1 min-w-0">
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-850 text-slate-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{r.file_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {(r.file_size / 1024).toFixed(1)} KB | Uploaded: {formatDateTime12(r.created_at)}
                    </p>
                    {r.ai_summary && (
                      <div className="flex items-start gap-1 bg-sky-500/5 border border-sky-500/10 p-2 rounded-xl text-[11px] text-slate-600 dark:text-slate-350 mt-1">
                        <BrainCircuit className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />
                        <span><strong>AI Summary:</strong> {r.ai_summary}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handlePreview(r)}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 transition"
                    title="Preview report"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(r)}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 text-sky-600 dark:text-sky-400 transition"
                    title="Download file"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {(mode === 'patient' || mode === 'admin') && (
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-600 dark:text-rose-400 transition"
                      title="Delete report"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Modal overlay */}
      {previewReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/20">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white truncate max-w-md">{previewReport.file_name}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{previewReport.mime_type}</p>
              </div>
              <button 
                onClick={handleClosePreview}
                className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex justify-center items-center bg-slate-100/50 dark:bg-slate-950/40">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2 py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                  <p className="text-xs text-slate-500">Loading document preview...</p>
                </div>
              ) : previewUrl ? (
                previewReport.mime_type.startsWith('image/') ? (
                  <img 
                    src={previewUrl} 
                    alt={previewReport.file_name} 
                    className="max-w-full max-h-[60vh] object-contain rounded-xl border border-slate-200 shadow-sm"
                  />
                ) : (
                  <iframe 
                    src={previewUrl} 
                    title={previewReport.file_name} 
                    className="w-full h-[60vh] rounded-xl border border-slate-200 shadow-sm"
                  />
                )
              ) : (
                <p className="text-xs text-red-500">Could not render preview file.</p>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-950/20">
              <button
                onClick={handleClosePreview}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition"
              >
                Close
              </button>
              <button
                onClick={() => handleDownload(previewReport)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Download Report</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
