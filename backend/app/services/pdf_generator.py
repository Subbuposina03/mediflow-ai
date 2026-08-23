import re
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from app.models.models import QueueToken
import html

def sanitize_text(text: str) -> str:
    if not text:
        return ""
    replacements = {
        "\u00b0": "deg ",
        "\u00b5": "u",
        "\u00b1": "+/-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
    }
    for search, replace in replacements.items():
        text = text.replace(search, replace)
    text = html.escape(text, quote=False)
    return text.encode("ascii", errors="replace").decode("ascii").replace("?", " ")

def format_multiline_text(text: str) -> str:
    if not text:
        return ""
    text = sanitize_text(text)
    text = text.replace("\n", "<br/>")
    text = text.replace("  ", "&nbsp;&nbsp;")
    return text

def parse_prescription_sections(notes: str) -> tuple[str, str]:
    """
    Parses doctor notes into two parts: general clinical notes and prescription block.
    Extracts the block starting with prescription headers case-insensitively.
    """
    if not notes:
        return "", ""
    
    # Matches patterns like **Prescription:**, Prescription:, ### Prescription, Rx:, etc.
    pattern = r"(?i)(?:\*\*|###|##)?\s*(?:prescription|rx|medications|medication|medicines)\s*(?:\*\*)?\s*:\s*"
    match = re.search(pattern, notes)
    if match:
        split_index = match.start()
        matched_len = match.end() - match.start()
        clinical_part = notes[:split_index].strip()
        prescription_body = notes[split_index + matched_len:].strip()
        return clinical_part, prescription_body
        
    # Backup: Match prescription without colon (e.g. **Prescription**\n)
    backup_pattern = r"(?i)(?:\*\*|###|##)?\s*(?:prescription|rx|medications|medication)\s*(?:\*\*)?\s*\n"
    match = re.search(backup_pattern, notes)
    if match:
        split_index = match.start()
        matched_len = match.end() - match.start()
        clinical_part = notes[:split_index].strip()
        prescription_body = notes[split_index + matched_len:].strip()
        return clinical_part, prescription_body
        
    return notes, ""

class PDFGenerator:
    @staticmethod
    def generate_prescription_pdf(token: QueueToken) -> BytesIO:
        """
        Generates a beautifully styled medical prescription PDF in-memory.
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        
        styles = getSampleStyleSheet()
        
        # Custom Styles
        title_style = ParagraphStyle(
            'DocTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=24,
            leading=28,
            textColor=colors.HexColor("#0284c7") # Sky blue primary
        )
        
        subtitle_style = ParagraphStyle(
            'DocSubTitle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=12,
            textColor=colors.HexColor("#475569") # Slate text
        )
        
        section_heading = ParagraphStyle(
            'SectionHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#1e293b"),
            spaceAfter=6
        )
        
        body_style = ParagraphStyle(
            'BodyTextCustom',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#334155")
        )
        
        meta_label_style = ParagraphStyle(
            'MetaLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#475569")
        )
        
        meta_value_style = ParagraphStyle(
            'MetaValue',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#0f172a")
        )

        elements = []
        
        # 1. Header Band
        header_data = [
            [
                Paragraph("MediFlow AI", title_style),
                Paragraph("<b>DIGITAL CONSULTATION RECORD</b><br/>Prescription & Clinical Summary", ParagraphStyle('HRight', parent=subtitle_style, alignment=2))
            ],
            [
                Paragraph("AI-Powered Hospital Queue &amp; Appointment Management System", subtitle_style),
                Paragraph(f"Generated On: {datetime.now().strftime('%d-%b-%Y %I:%M %p')}", ParagraphStyle('HRightSub', parent=subtitle_style, alignment=2))
            ]
        ]
        
        header_table = Table(header_data, colWidths=[270, 270])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('TOPPADDING', (0,0), (-1,-1), 2),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 10))
        
        # Decorative line
        line_table = Table([[""]], colWidths=[540], rowHeights=[2])
        line_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#0284c7")),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
        ]))
        elements.append(line_table)
        elements.append(Spacer(1, 15))
        
        # 2. Metadata Tables (Patient & Doctor info)
        patient = token.patient
        pat_name = sanitize_text(patient.user.name if patient and patient.user else "Patient")
        pat_gender = sanitize_text(patient.gender if patient else "N/A")
        pat_dob = sanitize_text(patient.date_of_birth if patient else "N/A")
        pat_blood = sanitize_text(patient.blood_group if patient else "N/A")
        
        doc_profile = token.doctor
        doc_name = sanitize_text(doc_profile.user.name if doc_profile and doc_profile.user else "Attending Clinician")
        doc_dept = sanitize_text(token.department.name if token.department else "General Medicine")
        doc_room = sanitize_text(doc_profile.room_number if doc_profile else "N/A")
        
        meta_data = [
            [
                Paragraph("Patient Name:", meta_label_style),
                Paragraph(pat_name, meta_value_style),
                Paragraph("Token Number:", meta_label_style),
                Paragraph(f"<b>{token.token_number}</b>", meta_value_style),
            ],
            [
                Paragraph("Gender / DOB:", meta_label_style),
                Paragraph(f"{pat_gender} / {pat_dob}", meta_value_style),
                Paragraph("Department:", meta_label_style),
                Paragraph(doc_dept, meta_value_style),
            ],
            [
                Paragraph("Blood Group:", meta_label_style),
                Paragraph(pat_blood, meta_value_style),
                Paragraph("Consulting Doctor:", meta_label_style),
                Paragraph(doc_name, meta_value_style),
            ],
            [
                Paragraph("Symptoms:", meta_label_style),
                Paragraph(sanitize_text(token.symptoms or "Routine Consult"), meta_value_style),
                Paragraph("Clinic Room:", meta_label_style),
                Paragraph(doc_room, meta_value_style),
            ]
        ]
        
        meta_table = Table(meta_data, colWidths=[90, 180, 90, 180])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#f1f5f9")),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 20))
        
        # Parse notes and determine prescription text
        clinical_notes, prescription_text = parse_prescription_sections(token.consultation_notes)
        
        # If no AI prescription block exists, fall back to treating the entire notes as manual prescription
        if not prescription_text or not prescription_text.strip():
            prescription_text = token.consultation_notes or ""
            clinical_notes = "Routine clinical consultation."
            
        clinical_notes = sanitize_text(clinical_notes)
        
        # 3. Clinical Summary / Notes
        elements.append(Paragraph("Attending Clinical Notes", section_heading))
        notes_paragraph = Paragraph(clinical_notes or "Routine clinical consultation. General health assessment completed.", body_style)
        
        notes_table = Table([[notes_paragraph]], colWidths=[540])
        notes_table.setStyle(TableStyle([
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ('BACKGROUND', (0,0), (-1,-1), colors.white),
        ]))
        elements.append(notes_table)
        elements.append(Spacer(1, 20))
        
        # 4. Rx Section
        elements.append(Paragraph("Rx (Prescribed Medications)", section_heading))
        
        if prescription_text.strip():
            # Format to preserve numbered list structure, line breaks, and indentation
            formatted_rx = format_multiline_text(prescription_text)
            rx_p = Paragraph(formatted_rx, body_style)
            
            rx_table = Table([[rx_p]], colWidths=[540])
            rx_table.setStyle(TableStyle([
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
                ('TOPPADDING', (0,0), (-1,-1), 10),
                ('BOTTOMPADDING', (0,0), (-1,-1), 10),
                ('LEFTPADDING', (0,0), (-1,-1), 10),
                ('RIGHTPADDING', (0,0), (-1,-1), 10),
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
            ]))
            elements.append(rx_table)
        else:
            no_med_text = "No specific prescription listing recorded. Please follow general clinical notes instructions."
            no_med_p = Paragraph(no_med_text, body_style)
            rx_table = Table([[no_med_p]], colWidths=[540])
            rx_table.setStyle(TableStyle([
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
                ('TOPPADDING', (0,0), (-1,-1), 10),
                ('BOTTOMPADDING', (0,0), (-1,-1), 10),
                ('LEFTPADDING', (0,0), (-1,-1), 10),
                ('RIGHTPADDING', (0,0), (-1,-1), 10),
                ('BACKGROUND', (0,0), (-1,-1), colors.white),
            ]))
            elements.append(rx_table)
            
        elements.append(Spacer(1, 40))
        
        # 5. Signature Box
        sig_data = [
            ["", Paragraph("_____________________________<br/><b>Attending Doctor Signature</b>", ParagraphStyle('Sig', parent=body_style, alignment=1))]
        ]
        sig_table = Table(sig_data, colWidths=[300, 240])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (1,0), (1,0), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(sig_table)
        
        # Build Document
        doc.build(elements)
        buffer.seek(0)
        return buffer

    @staticmethod
    def generate_receipt_pdf(payment, db) -> BytesIO:
        from app.models.models import PatientProfile, QueueToken, Department, DoctorProfile
        patient_profile = db.query(PatientProfile).filter(PatientProfile.id == payment.patient_id).first()
        patient_name = patient_profile.user.name if patient_profile and patient_profile.user else "Patient"
        patient_email = patient_profile.user.email if patient_profile and patient_profile.user else "N/A"

        # Fetch department & doctor details
        dept_name = "N/A"
        doctor_name = "General Pool"
        appointment_date = "N/A"
        
        if payment.appointment_id:
            token = db.query(QueueToken).filter(QueueToken.id == payment.appointment_id).first()
            if token:
                dept_name = token.department.name if token.department else "N/A"
                doctor_name = f"Dr. {token.doctor.user.name}" if token.doctor and token.doctor.user else "General Pool"
                appointment_date = token.appointment_time.strftime("%d-%b-%Y %I:%M %p")
        else:
            dept = db.query(Department).filter(Department.id == payment.department_id).first()
            if dept:
                dept_name = dept.name
            if payment.doctor_id:
                doc_profile = db.query(DoctorProfile).filter(DoctorProfile.id == payment.doctor_id).first()
                if doc_profile and doc_profile.user:
                    doctor_name = f"Dr. {doc_profile.user.name}"
            if payment.appointment_time:
                appointment_date = payment.appointment_time.strftime("%d-%b-%Y %I:%M %p")

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        
        styles = getSampleStyleSheet()
        
        # Custom Styles
        title_style = ParagraphStyle(
            'ReceiptTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=24,
            leading=28,
            textColor=colors.HexColor("#0284c7") # Sky blue primary
        )
        
        meta_label_style = ParagraphStyle(
            'MetaLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#475569")
        )
        
        meta_val_style = ParagraphStyle(
            'MetaVal',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#0f172a")
        )
        
        status_color = colors.HexColor("#16a34a") if payment.payment_status.lower() in ['paid', 'verified', 'successful'] else colors.HexColor("#dc2626") if payment.payment_status.lower() == 'rejected' else colors.HexColor("#d97706")

        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1e293b")
        )

        bold_style = ParagraphStyle(
            'Bold',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1e293b")
        )
        
        elements = []
        
        # Header
        elements.append(Paragraph("MediFlow AI", title_style))
        elements.append(Paragraph("AI-Powered Hospital Queue &amp; Appointment Management System", ParagraphStyle('Sub', fontName='Helvetica-Oblique', fontSize=10, leading=12, textColor=colors.HexColor("#64748b"))))
        elements.append(Spacer(1, 15))
        
        # Metadata block
        pay_method_label = "PAY AT COUNTER" if payment.payment_method.upper() in ["COUNTER", "PAY_AT_COUNTER"] else payment.payment_method.upper()
        ref_number = payment.stripe_payment_intent_id or payment.stripe_checkout_session_id or payment.utr_number or "N/A"

        
        meta_data = [
            [Paragraph("Receipt Number:", meta_label_style), Paragraph(payment.receipt_number, meta_val_style),
             Paragraph("Payment Status:", meta_label_style), Paragraph(payment.payment_status.upper(), ParagraphStyle('Stat', fontName='Helvetica-Bold', fontSize=9, textColor=status_color))],
            [Paragraph("Payment Method:", meta_label_style), Paragraph(pay_method_label, meta_val_style),
             Paragraph("Transaction Ref:", meta_label_style), Paragraph(ref_number, meta_val_style)],
            [Paragraph("Date & Time:", meta_label_style), Paragraph(created_str, meta_val_style),
             Paragraph("", meta_label_style), Paragraph("", meta_val_style)]
        ]
        meta_table = Table(meta_data, colWidths=[110, 160, 110, 160])
        meta_table.setStyle(TableStyle([
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
            ('PADDING', (0,0), (-1,-1), 8),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 20))
        
        # Patient & Appointment Info Section
        elements.append(Paragraph("<b>Billing & Consultation Details</b>", ParagraphStyle('SectHead', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=colors.HexColor("#0f172a"))))
        elements.append(Spacer(1, 8))
        
        details_data = [
            [Paragraph("Patient Name:", meta_label_style), Paragraph(patient_name, meta_val_style),
             Paragraph("Department:", meta_label_style), Paragraph(dept_name, meta_val_style)],
            [Paragraph("Patient Email:", meta_label_style), Paragraph(patient_email, meta_val_style),
             Paragraph("Doctor:", meta_label_style), Paragraph(doctor_name, meta_val_style)],
            [Paragraph("", meta_label_style), Paragraph("", meta_val_style),
             Paragraph("Appointment Time:", meta_label_style), Paragraph(appointment_date, meta_val_style)]
        ]
        details_table = Table(details_data, colWidths=[110, 160, 110, 160])
        details_table.setStyle(TableStyle([
            ('PADDING', (0,0), (-1,-1), 6),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        elements.append(details_table)
        elements.append(Spacer(1, 20))
        
        # Invoice Items Table
        consultation_fee = round(payment.amount / 1.18, 2)
        taxes = round(payment.amount - consultation_fee, 2)
        
        items_data = [
            [Paragraph("<b>Description</b>", bold_style), Paragraph("<b>Amount (INR)</b>", ParagraphStyle('Ar', fontName='Helvetica-Bold', alignment=2))],
            [Paragraph(f"Consultation Fee - {dept_name} ({doctor_name})", body_style), Paragraph(f"INR {consultation_fee:.2f}", ParagraphStyle('Ar_body', fontName='Helvetica', alignment=2))],
            [Paragraph("Taxes & Services (18% GST)", body_style), Paragraph(f"INR {taxes:.2f}", ParagraphStyle('Ar_body', fontName='Helvetica', alignment=2))],
            [Paragraph("<b>Total Amount Paid</b>", bold_style), Paragraph(f"<b>INR {payment.amount:.2f}</b>", ParagraphStyle('Ar_bold', fontName='Helvetica-Bold', alignment=2))]
        ]
        
        items_table = Table(items_data, colWidths=[380, 160])
        items_table.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,0), 1.5, colors.HexColor("#0f172a")),
            ('LINEBELOW', (0,1), (-1,1), 0.5, colors.HexColor("#e2e8f0")),
            ('LINEBELOW', (0,2), (-1,2), 1, colors.HexColor("#0f172a")),
            ('PADDING', (0,0), (-1,-1), 8),
            ('BACKGROUND', (0,3), (-1,3), colors.HexColor("#f1f5f9")),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 40))
        
        # Footer Note
        elements.append(Paragraph("Thank you for choosing MediFlow AI. This is an electronically generated receipt and does not require a physical signature.", ParagraphStyle('FootNote', fontName='Helvetica-Oblique', fontSize=8, alignment=1, textColor=colors.HexColor("#94748b"))))
        
        doc.build(elements)
        buffer.seek(0)
        return buffer
