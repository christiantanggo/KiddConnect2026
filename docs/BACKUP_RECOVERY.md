# Backup & Recovery Plan

## Overview

This document outlines the backup and recovery strategy for Tavari Phase 1.

## Backup Strategy

### Database Backups

#### Supabase PostgreSQL
- **Automatic Backups**: Supabase provides automatic daily backups
- **Retention**: 7 days of daily backups (configurable)
- **Point-in-Time Recovery**: Available for last 7 days
- **Manual Backups**: Can be triggered via Supabase dashboard or API

#### Backup Frequency
- **Daily**: Automatic via Supabase
- **Before Major Updates**: Manual backup recommended
- **Before Migrations**: Always create manual backup

### File Storage Backups

#### AWS S3 (Invoice PDFs)
- **Versioning**: Enable S3 versioning for invoice bucket
- **Lifecycle Policies**: Archive old versions to Glacier after 90 days
- **Cross-Region Replication**: Optional for disaster recovery

### Configuration Backups

#### Environment Variables
- Store securely in:
  - `.env` files (local development)
  - Environment variable management (production)
  - Secret management service (recommended: AWS Secrets Manager, HashiCorp Vault)

#### Code Backups
- **Git Repository**: Primary backup mechanism
- **Remote Repository**: GitHub, GitLab, or similar
- **Branch Protection**: Protect main/master branch

## Recovery Procedures

### Database Recovery

#### Point-in-Time Recovery (Supabase)
1. Access Supabase dashboard
2. Navigate to Database → Backups
3. Select restore point
4. Confirm restoration
5. Verify data integrity

#### Manual Backup Restoration
1. Export backup file from Supabase
2. Create new database (if needed)
3. Import backup file
4. Update connection strings
5. Verify data integrity

### Application Recovery

#### Code Recovery
1. Clone from Git repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Run migrations: `npm run migrate`
5. Start application: `npm start`

#### Service Recovery
1. Restore database (if needed)
2. Restore S3 bucket (if needed)
3. Update environment variables
4. Restart services
5. Verify health endpoints

## Data Export

### User Data Export (GDPR/CCPA Compliance)

#### Export Endpoint
- `GET /api/account/export` - Export all user data

#### Export Includes
- Business information
- Call history
- Messages
- Usage data
- Invoices
- Support tickets

#### Export Format
- JSON format
- ZIP file containing all data
- Includes metadata (export date, user ID)

### Manual Data Export

#### Database Export
```sql
-- Export business data
COPY businesses TO '/path/to/backup/businesses.csv' CSV HEADER;

-- Export call sessions
COPY call_sessions TO '/path/to/backup/call_sessions.csv' CSV HEADER;

-- Export messages
COPY messages TO '/path/to/backup/messages.csv' CSV HEADER;
```

## Disaster Recovery Plan

### Recovery Time Objectives (RTO)
- **Critical Services**: 1 hour
- **Non-Critical Services**: 4 hours

### Recovery Point Objectives (RPO)
- **Database**: 24 hours (daily backups)
- **Files**: 24 hours (S3 versioning)

### Disaster Scenarios

#### Scenario 1: Database Corruption
1. Identify corruption point
2. Restore from most recent backup
3. Verify data integrity
4. Notify affected users (if needed)

#### Scenario 2: Complete System Failure
1. Provision new infrastructure
2. Restore database from backup
3. Restore S3 bucket
4. Deploy application code
5. Update DNS/load balancer
6. Verify all services

#### Scenario 3: Data Breach
1. Isolate affected systems
2. Assess scope of breach
3. Notify affected users (per regulations)
4. Restore from pre-breach backup
5. Implement security patches
6. Monitor for further issues

## Backup Verification

### Regular Verification
- **Weekly**: Verify backup integrity
- **Monthly**: Test restoration procedure
- **Quarterly**: Full disaster recovery drill

### Verification Steps
1. Create test environment
2. Restore from backup
3. Verify data completeness
4. Test application functionality
5. Document any issues

## Monitoring & Alerts

### Backup Monitoring
- Monitor backup success/failure
- Alert on backup failures
- Track backup sizes
- Monitor storage usage

### Recovery Testing
- Schedule regular recovery tests
- Document recovery procedures
- Update procedures based on test results

## Best Practices

### Do's
- ✅ Test backups regularly
- ✅ Document recovery procedures
- ✅ Store backups in multiple locations
- ✅ Encrypt sensitive backup data
- ✅ Automate backup processes
- ✅ Monitor backup health

### Don'ts
- ❌ Rely on single backup location
- ❌ Skip backup verification
- ❌ Store backups with production data
- ❌ Ignore backup failures
- ❌ Delete old backups prematurely

## Tools & Services

### Recommended Tools
- **Supabase**: Database backups and PITR
- **AWS S3**: File storage with versioning
- **Git**: Code versioning
- **AWS Secrets Manager**: Secure configuration storage
- **Monitoring**: Sentry, CloudWatch, etc.

## Contact & Escalation

### Backup Issues
1. Check Supabase dashboard for backup status
2. Review application logs
3. Contact Supabase support if needed
4. Escalate to technical lead

### Recovery Issues
1. Follow recovery procedures
2. Document any deviations
3. Contact technical lead
4. Escalate if recovery fails

## Maintenance Schedule

### Daily
- Monitor backup success
- Review backup logs

### Weekly
- Verify backup integrity
- Review backup sizes

### Monthly
- Test restoration procedure
- Review and update documentation

### Quarterly
- Full disaster recovery drill
- Review and update recovery plan



















