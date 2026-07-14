export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          budget_amount: number
          company_id: string
          created_at: string | null
          department: string
          id: string
          month: number
          year: number
        }
        Insert: {
          budget_amount: number
          company_id: string
          created_at?: string | null
          department: string
          id?: string
          month: number
          year: number
        }
        Update: {
          budget_amount?: number
          company_id?: string
          created_at?: string | null
          department?: string
          id?: string
          month?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          base_currency: string
          country_code: string
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string | null
          stripe_customer_id: string | null
          tax_registration_number: string | null
          trial_expires_at: string | null
          trip_linking_mode: string
          vat_rate_override: number | null
          wappfly_api_token: string | null
          wappfly_session_id: string | null
          whatsapp_instance_id: string | null
          whatsapp_provider: string
        }
        Insert: {
          base_currency: string
          country_code: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string | null
          stripe_customer_id?: string | null
          tax_registration_number?: string | null
          trial_expires_at?: string | null
          trip_linking_mode?: string
          vat_rate_override?: number | null
          wappfly_api_token?: string | null
          wappfly_session_id?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_provider?: string
        }
        Update: {
          base_currency?: string
          country_code?: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string | null
          stripe_customer_id?: string | null
          tax_registration_number?: string | null
          trial_expires_at?: string | null
          trip_linking_mode?: string
          vat_rate_override?: number | null
          wappfly_api_token?: string | null
          wappfly_session_id?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_provider?: string
        }
        Relationships: []
      }
      country_configs: {
        Row: {
          base_currency: string
          country_code: string
          country_name: string
          created_at: string | null
          currency_name: string
          currency_symbol: string
          has_vat: boolean | null
          id: string
          tax_authority_name: string | null
          tax_id_label: string | null
          tax_name: string | null
          vat_rate: number
          vat_rate_reduced: number | null
        }
        Insert: {
          base_currency: string
          country_code: string
          country_name: string
          created_at?: string | null
          currency_name: string
          currency_symbol: string
          has_vat?: boolean | null
          id?: string
          tax_authority_name?: string | null
          tax_id_label?: string | null
          tax_name?: string | null
          vat_rate?: number
          vat_rate_reduced?: number | null
        }
        Update: {
          base_currency?: string
          country_code?: string
          country_name?: string
          created_at?: string | null
          currency_name?: string
          currency_symbol?: string
          has_vat?: boolean | null
          id?: string
          tax_authority_name?: string | null
          tax_id_label?: string | null
          tax_name?: string | null
          vat_rate?: number
          vat_rate_reduced?: number | null
        }
        Relationships: []
      }
      currency_pegs: {
        Row: {
          effective_from: string
          from_currency: string
          id: string
          notes: string | null
          rate: number
          to_currency: string
        }
        Insert: {
          effective_from: string
          from_currency: string
          id?: string
          notes?: string | null
          rate: number
          to_currency?: string
        }
        Update: {
          effective_from?: string
          from_currency?: string
          id?: string
          notes?: string | null
          rate?: number
          to_currency?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          company_id: string
          created_at: string | null
          department: string | null
          id: string
          is_active: boolean | null
          manager_profile_id: string | null
          name: string
          phone_number: string
          submission_frequency: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          department?: string | null
          id?: string
          is_active?: boolean | null
          manager_profile_id?: string | null
          name: string
          phone_number: string
          submission_frequency?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          department?: string | null
          id?: string
          is_active?: boolean | null
          manager_profile_id?: string | null
          name?: string
          phone_number?: string
          submission_frequency?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_connections: {
        Row: {
          base_url: string | null
          company_id: string
          created_at: string | null
          erp_type: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
        }
        Insert: {
          base_url?: string | null
          company_id: string
          created_at?: string | null
          erp_type?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
        }
        Update: {
          base_url?: string | null
          company_id?: string
          created_at?: string | null
          erp_type?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          base_amount: number | null
          category: string | null
          company_id: string
          created_at: string | null
          currency: string
          date: string
          employee_id: string | null
          employee_name: string | null
          employee_phone: string | null
          exchange_rate: number | null
          expense_type: string | null
          finance_reviewed_at: string | null
          finance_reviewed_by: string | null
          id: string
          leg_id: string | null
          notes: string | null
          original_amount: number | null
          original_currency: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          policy_flag: boolean | null
          policy_flag_reason: string | null
          receipt_image_url: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          source: string | null
          status: string | null
          submitter_id: string | null
          tax_amount: number | null
          tax_id_number: string | null
          trip_id: string | null
          trip_name: string | null
          vendor: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          base_amount?: number | null
          category?: string | null
          company_id: string
          created_at?: string | null
          currency: string
          date: string
          employee_id?: string | null
          employee_name?: string | null
          employee_phone?: string | null
          exchange_rate?: number | null
          expense_type?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          id?: string
          leg_id?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          policy_flag?: boolean | null
          policy_flag_reason?: string | null
          receipt_image_url?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          source?: string | null
          status?: string | null
          submitter_id?: string | null
          tax_amount?: number | null
          tax_id_number?: string | null
          trip_id?: string | null
          trip_name?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          base_amount?: number | null
          category?: string | null
          company_id?: string
          created_at?: string | null
          currency?: string
          date?: string
          employee_id?: string | null
          employee_name?: string | null
          employee_phone?: string | null
          exchange_rate?: number | null
          expense_type?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          id?: string
          leg_id?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          policy_flag?: boolean | null
          policy_flag_reason?: string | null
          receipt_image_url?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          source?: string | null
          status?: string | null
          submitter_id?: string | null
          tax_amount?: number | null
          tax_id_number?: string | null
          trip_id?: string | null
          trip_name?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_finance_reviewed_by_fkey"
            columns: ["finance_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string | null
          date: string
          from_currency: string
          id: string
          is_manual_override: boolean | null
          rate: number
          to_currency: string
        }
        Insert: {
          created_at?: string | null
          date: string
          from_currency: string
          id?: string
          is_manual_override?: boolean | null
          rate: number
          to_currency: string
        }
        Update: {
          created_at?: string | null
          date?: string
          from_currency?: string
          id?: string
          is_manual_override?: boolean | null
          rate?: number
          to_currency?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          company_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          related_expense_id: string | null
          related_trip_id: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          related_expense_id?: string | null
          related_trip_id?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          related_expense_id?: string | null
          related_trip_id?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_expense_id_fkey"
            columns: ["related_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_trip_id_fkey"
            columns: ["related_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      per_diem_rates: {
        Row: {
          company_id: string
          created_at: string | null
          currency: string
          daily_rate: number
          destination: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          currency: string
          daily_rate: number
          destination: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          currency?: string
          daily_rate?: number
          destination?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "per_diem_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_limit_aed: number | null
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_ceo: boolean
          manager_id: string | null
          notification_preferences: Json | null
          role: string | null
          super_admin: boolean | null
        }
        Insert: {
          approval_limit_aed?: number | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          is_ceo?: boolean
          manager_id?: string | null
          notification_preferences?: Json | null
          role?: string | null
          super_admin?: boolean | null
        }
        Update: {
          approval_limit_aed?: number | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_ceo?: boolean
          manager_id?: string | null
          notification_preferences?: Json | null
          role?: string | null
          super_admin?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spend_policies: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          daily_limit: number | null
          id: string
          is_blocked: boolean | null
          monthly_limit: number | null
          requires_notes_above: number | null
        }
        Insert: {
          category: string
          company_id: string
          created_at?: string | null
          daily_limit?: number | null
          id?: string
          is_blocked?: boolean | null
          monthly_limit?: number | null
          requires_notes_above?: number | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          daily_limit?: number | null
          id?: string
          is_blocked?: boolean | null
          monthly_limit?: number | null
          requires_notes_above?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "spend_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          employee_id: string
          id: string
          joined_at: string | null
          team_id: string
        }
        Insert: {
          employee_id: string
          id?: string
          joined_at?: string | null
          team_id: string
        }
        Update: {
          employee_id?: string
          id?: string
          joined_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          manager_id: string | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          manager_id?: string | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          manager_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_legs: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          budget: number | null
          company_id: string
          container_ref: string | null
          created_at: string
          destination: string
          destination_country: string | null
          distance_km: number | null
          id: string
          mode: string | null
          notes: string | null
          origin: string
          origin_country: string | null
          planned_end: string | null
          planned_start: string | null
          sequence: number
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          budget?: number | null
          company_id: string
          container_ref?: string | null
          created_at?: string
          destination: string
          destination_country?: string | null
          distance_km?: number | null
          id?: string
          mode?: string | null
          notes?: string | null
          origin: string
          origin_country?: string | null
          planned_end?: string | null
          planned_start?: string | null
          sequence?: number
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          budget?: number | null
          company_id?: string
          container_ref?: string | null
          created_at?: string
          destination?: string
          destination_country?: string | null
          distance_km?: number | null
          id?: string
          mode?: string | null
          notes?: string | null
          origin?: string
          origin_country?: string | null
          planned_end?: string | null
          planned_start?: string | null
          sequence?: number
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_legs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_legs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget_aed: number | null
          company_id: string
          container_number: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          destination: string | null
          end_date: string | null
          enforce_currency: boolean | null
          enforced_currency: string | null
          id: string
          name: string
          origin: string | null
          start_date: string | null
          status: string | null
          team_id: string | null
          trip_type: string
        }
        Insert: {
          budget_aed?: number | null
          company_id: string
          container_number?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          destination?: string | null
          end_date?: string | null
          enforce_currency?: boolean | null
          enforced_currency?: string | null
          id?: string
          name: string
          origin?: string | null
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          trip_type?: string
        }
        Update: {
          budget_aed?: number | null
          company_id?: string
          container_number?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          destination?: string | null
          end_date?: string | null
          enforce_currency?: boolean | null
          enforced_currency?: string | null
          id?: string
          name?: string
          origin?: string | null
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          trip_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_update_profile:
        | {
            Args: {
              _is_ceo: boolean
              _manager_id: string
              _profile_id: string
              _role: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _full_name?: string
              _is_ceo: boolean
              _manager_id: string
              _profile_id: string
              _role: string
            }
            Returns: undefined
          }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_approver: { Args: { _profile_id: string }; Returns: string[] }
      get_company_billing: {
        Args: { _company_id: string }
        Returns: {
          stripe_customer_id: string
          tax_registration_number: string
        }[]
      }
      get_company_by_wappfly_session: {
        Args: { _session_id: string }
        Returns: string
      }
      get_company_by_whatsapp_instance: {
        Args: { _instance_id: string }
        Returns: string
      }
      get_company_whatsapp_settings: {
        Args: { _company_id: string }
        Returns: {
          wappfly_session_id: string
          wappfly_token_set: boolean
          whatsapp_instance_id: string
          whatsapp_provider: string
        }[]
      }
      get_team_company_id: { Args: { _team_id: string }; Returns: string }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_full_name: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_direct_reports: { Args: { _user_id: string }; Returns: boolean }
      is_demo_company: { Args: { _company_id: string }; Returns: boolean }
      is_manager_of_submitter: {
        Args: {
          _company_id: string
          _employee_id: string
          _employee_name: string
          _manager_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reassign_manager: {
        Args: {
          _new_manager_id: string
          _person_id: string
          _person_type: string
        }
        Returns: undefined
      }
      update_company_tax_registration: {
        Args: { _company_id: string; _tax_registration_number: string }
        Returns: undefined
      }
      update_company_wappfly: {
        Args: {
          _company_id: string
          _provider: string
          _session_id: string
          _token: string
        }
        Returns: undefined
      }
      update_company_whatsapp_instance: {
        Args: { _company_id: string; _instance_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
