# MediFlow AI - Intelligent Hospital Queue Optimization

MediFlow AI is a production-ready, full-stack SaaS application built to minimize outpatient waiting times in hospitals. It features dynamic AI-driven triage prioritization, statistical wait-time estimations, no-show probability assessments, and real-time synchronization utilizing WebSockets.

---

## 🏗️ Architecture & Technologies

### Backend
- **Framework**: FastAPI (Python 3.10)
- **Database**: MySQL 8.0 / SQLAlchemy ORM
- **Authentication**: OAuth2 / Bearer JWT
- **Real-Time Communication**: Native WebSockets
- **AI Algorithms**: Scikit-Learn (Linear Regression for Wait times, Logistic Regression for No-Shows, Symptom Keyword NLP parser for Triage weighting)

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom glassmorphism
- **Icons**: Lucide React
- **HTTP Client**: Axios

---

## ⚡ Quick Start (Docker Deployment)

Spin up the entire stack including MySQL, FastAPI, and Nginx-served React bundles with a single command:

```bash
docker-compose up --build
```

- **Frontend Application**: [http://localhost:3000](http://localhost:3000)
- **FastAPI REST documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🔑 Seeded Demo Accounts

The database auto-seeds itself on startup with the following test credentials:

| Role | Username | Password | Actions / Access |
| :--- | :--- | :--- | :--- |
| **Patient** | `patient@mediflow.com` | `patient123` | Book consultations, view live wait times & queue position, update histories. |
| **Clinician** | `doctor@mediflow.com` | `doctor123` | Set availability, call next patient, write consultation notes, skip tokens. |
| **Administrator** | `admin@mediflow.com` | `admin123` | View load statistics, CRUD departments, reassign doctors, audit patients. |

---

## 🧬 Core Engines

### 1. Wait Time Predictor
Combines queue length, average consultation duration, active workforce count, and priority indices inside a regression model. Wait time decreases when more doctors set themselves to "Active".

### 2. Triage Priority Score
Calculates a triage index by examining the designated emergency severity level and checking symptom reports for emergency indicators (e.g. `chest pain`, `bleeding`, `stroke`). 

### 3. Queue Optimizer
Implements a non-starvation priority queue. High-priority patients are bubbled upwards, balanced against appointment times.
