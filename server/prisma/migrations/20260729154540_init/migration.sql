-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'vehicle_owner',
    "assigned_facility_id" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "capacity" DOUBLE PRECISION,
    "billing_mode" TEXT NOT NULL DEFAULT 'free',
    "hourly_rate" DOUBLE PRECISION,
    "standard_rate" DOUBLE PRECISION,
    "subscription_monthly_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "exit_timeout_minutes" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "qr_deactivate_after_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "logo_url" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "qr_code_id" TEXT,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "owner_email" TEXT,
    "owner_photo_url" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "plate_number" TEXT NOT NULL,
    "make_model" TEXT,
    "color" TEXT,
    "photo_front_url" TEXT,
    "photo_back_url" TEXT,
    "photo_side_url" TEXT,
    "photo_url" TEXT,
    "facility_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "registration_type" TEXT NOT NULL DEFAULT 'permanent',
    "guest_pass_expires" TIMESTAMP(3),
    "guest_pass_notified" BOOLEAN NOT NULL DEFAULT false,
    "is_inside" BOOLEAN NOT NULL DEFAULT false,
    "last_entry" TIMESTAMP(3),
    "last_exit" TIMESTAMP(3),
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "qr_requested" BOOLEAN NOT NULL DEFAULT false,
    "qr_request_date" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRCode" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "code_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "batch_name" TEXT,
    "code_type" TEXT NOT NULL DEFAULT 'permanent',
    "guest_duration_hours" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'available',
    "vehicle_id" TEXT,
    "generated_by" TEXT,
    "qr_image_url" TEXT,

    CONSTRAINT "QRCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "vehicle_id" TEXT,
    "qr_code_id" TEXT NOT NULL,
    "facility_id" TEXT,
    "scan_type" TEXT NOT NULL,
    "scanned_by" TEXT,
    "scanned_by_name" TEXT,
    "plate_number" TEXT,
    "owner_name" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "items_declared" JSONB,
    "booth_photo_urls" JSONB,
    "security_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "security_notes" TEXT,
    "discrepancies" TEXT,
    "notes" TEXT,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemLog" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "scan_log_id" TEXT,
    "vehicle_id" TEXT NOT NULL,
    "facility_id" TEXT,
    "plate_number" TEXT,
    "owner_name" TEXT,
    "driver_name" TEXT,
    "scan_type" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "description" TEXT,
    "photo_urls" JSONB,
    "verified_on_exit" BOOLEAN,
    "discrepancy_note" TEXT,
    "logged_by" TEXT,

    CONSTRAINT "ItemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitRequest" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "qr_code_id" TEXT,
    "facility_id" TEXT NOT NULL,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "owner_email" TEXT,
    "plate_number" TEXT,
    "requested_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "responded_by" TEXT,
    "approval_token" TEXT,
    "billing_amount" DOUBLE PRECISION,
    "duration_minutes" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "ExitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPass" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "owner_email" TEXT,
    "plate_number" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "pass_code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "last_used_at" TIMESTAMP(3),
    "use_count" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "DriverPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "vehicle_id" TEXT,
    "facility_id" TEXT NOT NULL,
    "exit_request_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "billing_mode" TEXT,
    "duration_minutes" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_method" TEXT,
    "reference" TEXT,
    "plate_number" TEXT,
    "owner_name" TEXT,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "facility_id" TEXT NOT NULL,
    "facility_name" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "month" DOUBLE PRECISION NOT NULL,
    "year" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paystack_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "email" TEXT,
    "created_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingItem" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "facility_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'NGN',

    CONSTRAINT "BillingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBill" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "billing_item_id" TEXT,
    "vehicle_id" TEXT,
    "facility_id" TEXT NOT NULL,
    "owner_name" TEXT,
    "owner_email" TEXT,
    "plate_number" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMP(3),
    "billing_month" DOUBLE PRECISION,
    "billing_year" DOUBLE PRECISION,
    "payment_method" TEXT,
    "paystack_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "issued_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "UserBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "facility_id" TEXT,
    "facility_name" TEXT,
    "vehicle_id" TEXT,
    "plate_number" TEXT,
    "owner_name" TEXT,
    "driver_name" TEXT,
    "scan_log_id" TEXT,
    "title" TEXT,
    "description" TEXT,
    "discrepancy_details" TEXT,
    "overstay_hours" DOUBLE PRECISION,
    "threshold_hours" DOUBLE PRECISION,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandover" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "officer_name" TEXT NOT NULL,
    "officer_email" TEXT,
    "facility_id" TEXT NOT NULL,
    "facility_name" TEXT,
    "shift_start" TIMESTAMP(3),
    "shift_end" TIMESTAMP(3),
    "total_entries" DOUBLE PRECISION,
    "total_exits" DOUBLE PRECISION,
    "vehicles_inside" DOUBLE PRECISION,
    "pending_exits" DOUBLE PRECISION,
    "notes" TEXT,
    "next_officer_name" TEXT,
    "next_officer_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "report_data" JSONB,

    CONSTRAINT "ShiftHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "facility_id" TEXT,
    "user_id" TEXT,
    "user_email" TEXT,
    "notify_email" BOOLEAN NOT NULL DEFAULT true,
    "notify_inapp" BOOLEAN NOT NULL DEFAULT true,
    "notify_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_number" TEXT,
    "notify_on_entry" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_exit_request" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_guest_expiry" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_blacklist" BOOLEAN NOT NULL DEFAULT true,
    "security_override_enabled" BOOLEAN NOT NULL DEFAULT false,
    "security_override_roles" JSONB,
    "guest_pass_alert_minutes" DOUBLE PRECISION NOT NULL DEFAULT 30,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "document_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "value_json" JSONB,
    "label" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "updated_by" TEXT,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_assigned_facility_id_idx" ON "User"("assigned_facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_user_email_idx" ON "PushToken"("user_email");

-- CreateIndex
CREATE INDEX "Vehicle_qr_code_id_idx" ON "Vehicle"("qr_code_id");

-- CreateIndex
CREATE INDEX "Vehicle_facility_id_idx" ON "Vehicle"("facility_id");

-- CreateIndex
CREATE INDEX "Vehicle_owner_email_idx" ON "Vehicle"("owner_email");

-- CreateIndex
CREATE INDEX "Vehicle_plate_number_idx" ON "Vehicle"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "QRCode_code_id_key" ON "QRCode"("code_id");

-- CreateIndex
CREATE INDEX "QRCode_facility_id_idx" ON "QRCode"("facility_id");

-- CreateIndex
CREATE INDEX "QRCode_status_idx" ON "QRCode"("status");

-- CreateIndex
CREATE INDEX "ScanLog_vehicle_id_idx" ON "ScanLog"("vehicle_id");

-- CreateIndex
CREATE INDEX "ScanLog_facility_id_idx" ON "ScanLog"("facility_id");

-- CreateIndex
CREATE INDEX "ScanLog_scan_type_idx" ON "ScanLog"("scan_type");

-- CreateIndex
CREATE INDEX "ScanLog_created_date_idx" ON "ScanLog"("created_date");

-- CreateIndex
CREATE INDEX "ItemLog_vehicle_id_idx" ON "ItemLog"("vehicle_id");

-- CreateIndex
CREATE INDEX "ItemLog_facility_id_idx" ON "ItemLog"("facility_id");

-- CreateIndex
CREATE INDEX "ItemLog_scan_log_id_idx" ON "ItemLog"("scan_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExitRequest_approval_token_key" ON "ExitRequest"("approval_token");

-- CreateIndex
CREATE INDEX "ExitRequest_vehicle_id_idx" ON "ExitRequest"("vehicle_id");

-- CreateIndex
CREATE INDEX "ExitRequest_facility_id_idx" ON "ExitRequest"("facility_id");

-- CreateIndex
CREATE INDEX "ExitRequest_status_idx" ON "ExitRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPass_pass_code_key" ON "DriverPass"("pass_code");

-- CreateIndex
CREATE INDEX "DriverPass_vehicle_id_idx" ON "DriverPass"("vehicle_id");

-- CreateIndex
CREATE INDEX "DriverPass_owner_email_idx" ON "DriverPass"("owner_email");

-- CreateIndex
CREATE INDEX "Payment_facility_id_idx" ON "Payment"("facility_id");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_facility_id_idx" ON "SubscriptionPayment"("facility_id");

-- CreateIndex
CREATE INDEX "UserBill_facility_id_idx" ON "UserBill"("facility_id");

-- CreateIndex
CREATE INDEX "UserBill_owner_email_idx" ON "UserBill"("owner_email");

-- CreateIndex
CREATE INDEX "UserBill_status_idx" ON "UserBill"("status");

-- CreateIndex
CREATE INDEX "SecurityAlert_facility_id_idx" ON "SecurityAlert"("facility_id");

-- CreateIndex
CREATE INDEX "SecurityAlert_status_idx" ON "SecurityAlert"("status");

-- CreateIndex
CREATE INDEX "SecurityAlert_alert_type_idx" ON "SecurityAlert"("alert_type");

-- CreateIndex
CREATE INDEX "ShiftHandover_facility_id_idx" ON "ShiftHandover"("facility_id");

-- CreateIndex
CREATE INDEX "NotificationSettings_user_email_idx" ON "NotificationSettings"("user_email");

-- CreateIndex
CREATE INDEX "NotificationSettings_facility_id_idx" ON "NotificationSettings"("facility_id");

-- CreateIndex
CREATE INDEX "LegalDocument_document_type_idx" ON "LegalDocument"("document_type");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_key_key" ON "AppConfig"("key");
