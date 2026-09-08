CREATE TABLE IF NOT EXISTS beneficiaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_user_id BIGINT UNSIGNED NOT NULL,
  beneficiary_number VARCHAR(50) NULL,
  name VARCHAR(255) NOT NULL,
  national_id VARCHAR(50) NULL,
  nationality VARCHAR(100) NULL,
  birth_date DATE NULL,
  age TINYINT UNSIGNED NULL,
  mobile VARCHAR(20) NULL,
  email VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  address VARCHAR(500) NULL,
  marital_status VARCHAR(50) NULL,
  family_members_count SMALLINT UNSIGNED NULL,
  income DECIMAL(12, 2) NULL,
  iban VARCHAR(34) NULL,
  registered_at DATETIME NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_beneficiaries_source_user (source_user_id),
  UNIQUE KEY uq_beneficiaries_number (beneficiary_number),
  CONSTRAINT fk_beneficiaries_source_user
    FOREIGN KEY (source_user_id) REFERENCES `33fubbf_users` (ID)
    ON UPDATE CASCADE ON DELETE CASCADE
);

INSERT INTO beneficiaries (source_user_id, name, email, registered_at)
SELECT u.ID, u.display_name, u.user_email, u.user_registered
FROM `33fubbf_users` u
INNER JOIN `33fubbf_usermeta` um ON um.user_id = u.ID
WHERE um.meta_key = '33FuBbf_capabilities'
  AND (um.meta_value LIKE '%um_custom_role_4%'
    OR um.meta_value LIKE '%beneficiary%'
    OR um.meta_value LIKE '%مستفيد%')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), email = VALUES(email), registered_at = VALUES(registered_at);

DROP TRIGGER IF EXISTS sync_beneficiary_after_user_meta_insert;
DROP TRIGGER IF EXISTS sync_beneficiary_after_user_meta_update;

CREATE TRIGGER sync_beneficiary_after_user_meta_insert
AFTER INSERT ON `33fubbf_usermeta`
FOR EACH ROW
INSERT INTO beneficiaries (source_user_id, name, email, registered_at)
SELECT u.ID, u.display_name, u.user_email, u.user_registered
FROM `33fubbf_users` u
WHERE u.ID = NEW.user_id
  AND NEW.meta_key = '33FuBbf_capabilities'
  AND (NEW.meta_value LIKE '%um_custom_role_4%'
    OR NEW.meta_value LIKE '%beneficiary%'
    OR NEW.meta_value LIKE '%مستفيد%')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), email = VALUES(email);

DELIMITER $$
CREATE TRIGGER sync_beneficiary_after_user_meta_update
AFTER UPDATE ON `33fubbf_usermeta`
FOR EACH ROW
BEGIN
  IF NEW.meta_key = '33FuBbf_capabilities' THEN
    INSERT INTO beneficiaries (source_user_id, name, email, registered_at)
    SELECT u.ID, u.display_name, u.user_email, u.user_registered
    FROM `33fubbf_users` u
    WHERE u.ID = NEW.user_id
      AND (NEW.meta_value LIKE '%um_custom_role_4%'
        OR NEW.meta_value LIKE '%beneficiary%'
        OR NEW.meta_value LIKE '%مستفيد%')
    ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email);
    IF NOT (NEW.meta_value LIKE '%um_custom_role_4%'
      OR NEW.meta_value LIKE '%beneficiary%'
      OR NEW.meta_value LIKE '%مستفيد%') THEN
      DELETE FROM beneficiaries WHERE source_user_id = NEW.user_id;
    END IF;
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS treatment_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  beneficiary_id BIGINT UNSIGNED NOT NULL,
  hospital_name VARCHAR(255) NULL,
  doctor_name VARCHAR(255) NULL,
  diagnosis TEXT NULL,
  disease_type VARCHAR(255) NULL,
  treatment_cost DECIMAL(12, 2) NULL,
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  submission_type ENUM('draft', 'submit') NOT NULL DEFAULT 'draft',
  status ENUM(
    'draft',
    'waiting_review',
    'under_social_research',
    'social_research_approved',
    'social_research_rejected',
    'under_medical_committee_review',
    'medical_committee_approved',
    'medical_committee_rejected',
    'under_finance_review',
    'finance_approved',
    'finance_rejected',
    'under_management_review',
    'approved',
    'rejected',
    'returned_for_correction',
    'completed'
  ) NOT NULL DEFAULT 'draft',
  stage ENUM(
    'مستفيد',
    'باحث اجتماعي',
    'عضو لجنة طبية',
    'رئيس لجنة طبية',
    'أمين لجنة',
    'مالية',
    'مدير تنفيذي',
    'مدير النظام'
  ) NOT NULL DEFAULT 'مستفيد',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_treatment_requests_beneficiary (beneficiary_id),
  INDEX idx_treatment_requests_status (status),
  CONSTRAINT fk_treatment_requests_beneficiary
    FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS treatment_request_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  treatment_request_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_attachments_request (treatment_request_id),
  CONSTRAINT fk_attachments_treatment_request
    FOREIGN KEY (treatment_request_id) REFERENCES treatment_requests (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE treatment_requests ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER stage;

CREATE TABLE IF NOT EXISTS treatment_request_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  treatment_request_id BIGINT UNSIGNED NULL,
  operation_type VARCHAR(100) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  operation_date DATE NOT NULL,
  operation_time TIME NOT NULL,
  ip_address VARCHAR(45) NULL,
  device VARCHAR(500) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_request (treatment_request_id),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_date (operation_date, operation_time),
  CONSTRAINT fk_audit_request
    FOREIGN KEY (treatment_request_id) REFERENCES treatment_requests (id)
    ON UPDATE CASCADE ON DELETE SET NULL
);