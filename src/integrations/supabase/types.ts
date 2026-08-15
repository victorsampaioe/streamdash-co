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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string
          created_at: string
          description: string
          emoji: string
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          emoji: string
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          emoji?: string
          title?: string
        }
        Relationships: []
      }
      activation_logs: {
        Row: {
          created_at: string | null
          id: string
          payment_id: string | null
          plan: string | null
          status_payment: string | null
          telegram_error: string | null
          telegram_sent: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          payment_id?: string | null
          plan?: string | null
          status_payment?: string | null
          telegram_error?: string | null
          telegram_sent?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payment_id?: string | null
          plan?: string | null
          status_payment?: string | null
          telegram_error?: string | null
          telegram_sent?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_channels: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          name: string
          owner_id: string
          target: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          name: string
          owner_id: string
          target: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          name?: string
          owner_id?: string
          target?: string
        }
        Relationships: []
      }
      alert_idempotency: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      art_generations: {
        Row: {
          channels: Json
          created_at: string
          created_by: string
          id: string
          movies: Json
          period_hours: number
          series: Json
          server_id: string
          server_name: string
          total_new: number
        }
        Insert: {
          channels?: Json
          created_at?: string
          created_by: string
          id?: string
          movies?: Json
          period_hours?: number
          series?: Json
          server_id: string
          server_name: string
          total_new?: number
        }
        Update: {
          channels?: Json
          created_at?: string
          created_by?: string
          id?: string
          movies?: Json
          period_hours?: number
          series?: Json
          server_id?: string
          server_name?: string
          total_new?: number
        }
        Relationships: [
          {
            foreignKeyName: "art_generations_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      check_regions: {
        Row: {
          city: string
          code: string
          country: string
          created_at: string
          enabled: boolean
          flag: string
          latitude: number
          longitude: number
          name: string
        }
        Insert: {
          city: string
          code: string
          country: string
          created_at?: string
          enabled?: boolean
          flag: string
          latitude: number
          longitude: number
          name: string
        }
        Update: {
          city?: string
          code?: string
          country?: string
          created_at?: string
          enabled?: boolean
          flag?: string
          latitude?: number
          longitude?: number
          name?: string
        }
        Relationships: []
      }
      checks: {
        Row: {
          checked_at: string
          dns_resolved_ip: string | null
          error: string | null
          http_status: number | null
          id: number
          latency_ms: number | null
          server_id: string
          ssl_days_remaining: number | null
          status: Database["public"]["Enums"]["server_status"]
        }
        Insert: {
          checked_at?: string
          dns_resolved_ip?: string | null
          error?: string | null
          http_status?: number | null
          id?: number
          latency_ms?: number | null
          server_id: string
          ssl_days_remaining?: number | null
          status: Database["public"]["Enums"]["server_status"]
        }
        Update: {
          checked_at?: string
          dns_resolved_ip?: string | null
          error?: string | null
          http_status?: number | null
          id?: number
          latency_ms?: number | null
          server_id?: string
          ssl_days_remaining?: number | null
          status?: Database["public"]["Enums"]["server_status"]
        }
        Relationships: [
          {
            foreignKeyName: "checks_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      checks_daily: {
        Row: {
          avg_latency_ms: number | null
          created_at: string
          day: string
          degraded: number
          downs: number
          incidents: number
          max_latency_ms: number | null
          server_id: string
          total: number
          ups: number
          uptime_pct: number | null
        }
        Insert: {
          avg_latency_ms?: number | null
          created_at?: string
          day: string
          degraded?: number
          downs?: number
          incidents?: number
          max_latency_ms?: number | null
          server_id: string
          total?: number
          ups?: number
          uptime_pct?: number | null
        }
        Update: {
          avg_latency_ms?: number | null
          created_at?: string
          day?: string
          degraded?: number
          downs?: number
          incidents?: number
          max_latency_ms?: number | null
          server_id?: string
          total?: number
          ups?: number
          uptime_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_daily_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      checks_hourly: {
        Row: {
          avg_latency_ms: number | null
          created_at: string
          degraded: number
          downs: number
          first_detector_region: string | null
          hour: string
          max_latency_ms: number | null
          min_latency_ms: number | null
          server_id: string
          ssl_days_remaining: number | null
          total: number
          ups: number
        }
        Insert: {
          avg_latency_ms?: number | null
          created_at?: string
          degraded?: number
          downs?: number
          first_detector_region?: string | null
          hour: string
          max_latency_ms?: number | null
          min_latency_ms?: number | null
          server_id: string
          ssl_days_remaining?: number | null
          total?: number
          ups?: number
        }
        Update: {
          avg_latency_ms?: number | null
          created_at?: string
          degraded?: number
          downs?: number
          first_detector_region?: string | null
          hour?: string
          max_latency_ms?: number | null
          min_latency_ms?: number | null
          server_id?: string
          ssl_days_remaining?: number | null
          total?: number
          ups?: number
        }
        Relationships: [
          {
            foreignKeyName: "checks_hourly_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      content_alert_settings: {
        Row: {
          created_at: string
          id: string
          minimum_failures: number
          notify_channels: boolean
          notify_movies: boolean
          notify_only_favorites: boolean
          notify_recovery: boolean
          notify_series: boolean
          server_id: string | null
          telegram_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          minimum_failures?: number
          notify_channels?: boolean
          notify_movies?: boolean
          notify_only_favorites?: boolean
          notify_recovery?: boolean
          notify_series?: boolean
          server_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          minimum_failures?: number
          notify_channels?: boolean
          notify_movies?: boolean
          notify_only_favorites?: boolean
          notify_recovery?: boolean
          notify_series?: boolean
          server_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_alert_settings_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      content_checks: {
        Row: {
          bytes_received: number | null
          checked_at: string
          checked_by: string | null
          content_id: string
          detected_format: string | null
          error_message: string | null
          first_byte_time_ms: number | null
          http_status: number | null
          id: number
          manual: boolean
          region: string
          response_time_ms: number | null
          server_id: string
          status: Database["public"]["Enums"]["content_status"]
        }
        Insert: {
          bytes_received?: number | null
          checked_at?: string
          checked_by?: string | null
          content_id: string
          detected_format?: string | null
          error_message?: string | null
          first_byte_time_ms?: number | null
          http_status?: number | null
          id?: number
          manual?: boolean
          region?: string
          response_time_ms?: number | null
          server_id: string
          status: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          bytes_received?: number | null
          checked_at?: string
          checked_by?: string | null
          content_id?: string
          detected_format?: string | null
          error_message?: string | null
          first_byte_time_ms?: number | null
          http_status?: number | null
          id?: number
          manual?: boolean
          region?: string
          response_time_ms?: number | null
          server_id?: string
          status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: [
          {
            foreignKeyName: "content_checks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "monitored_contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_checks_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      content_daily_summary: {
        Row: {
          average_response_time: number | null
          blocked_count: number
          created_at: string
          health_score: number | null
          id: string
          offline_count: number
          online_count: number
          recovered_count: number
          removed_count: number
          server_id: string
          slow_count: number
          summary_date: string
          total_contents: number
          unstable_count: number
          updated_at: string
        }
        Insert: {
          average_response_time?: number | null
          blocked_count?: number
          created_at?: string
          health_score?: number | null
          id?: string
          offline_count?: number
          online_count?: number
          recovered_count?: number
          removed_count?: number
          server_id: string
          slow_count?: number
          summary_date: string
          total_contents?: number
          unstable_count?: number
          updated_at?: string
        }
        Update: {
          average_response_time?: number | null
          blocked_count?: number
          created_at?: string
          health_score?: number | null
          id?: string
          offline_count?: number
          online_count?: number
          recovered_count?: number
          removed_count?: number
          server_id?: string
          slow_count?: number
          summary_date?: string
          total_contents?: number
          unstable_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_daily_summary_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      content_diagnostics: {
        Row: {
          bytes_read: number | null
          codec: string | null
          connection_ms: number | null
          content_id: string
          content_type: string
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          is_cached: boolean | null
          resolution: string | null
          server_id: string
          status: string
          steps: Json | null
          ttfb_ms: number | null
          user_id: string | null
        }
        Insert: {
          bytes_read?: number | null
          codec?: string | null
          connection_ms?: number | null
          content_id: string
          content_type: string
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          is_cached?: boolean | null
          resolution?: string | null
          server_id: string
          status: string
          steps?: Json | null
          ttfb_ms?: number | null
          user_id?: string | null
        }
        Update: {
          bytes_read?: number | null
          codec?: string | null
          connection_ms?: number | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          is_cached?: boolean | null
          resolution?: string | null
          server_id?: string
          status?: string
          steps?: Json | null
          ttfb_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_diagnostics_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      content_scan_runs: {
        Row: {
          failed: number
          finished_at: string | null
          general_failure: boolean
          id: string
          note: string | null
          recovered: number
          server_id: string
          started_at: string
          tested: number
          triggered_by: string | null
        }
        Insert: {
          failed?: number
          finished_at?: string | null
          general_failure?: boolean
          id?: string
          note?: string | null
          recovered?: number
          server_id: string
          started_at?: string
          tested?: number
          triggered_by?: string | null
        }
        Update: {
          failed?: number
          finished_at?: string | null
          general_failure?: boolean
          id?: string
          note?: string | null
          recovered?: number
          server_id?: string
          started_at?: string
          tested?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_scan_runs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_id: string
          buyer_read_at: string | null
          closed_at: string | null
          created_at: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          seller_id: string
          seller_read_at: string | null
          updated_at: string
        }
        Insert: {
          buyer_id: string
          buyer_read_at?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          seller_id: string
          seller_read_at?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          buyer_read_at?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          seller_id?: string
          seller_read_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      core_execution_logs: {
        Row: {
          created_at: string | null
          endpoint: string
          error_message: string | null
          execution_time_ms: number | null
          id: string
          request_payload: Json | null
          response_data: Json | null
          response_status: number | null
          status: string
          task_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          request_payload?: Json | null
          response_data?: Json | null
          response_status?: number | null
          status: string
          task_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          request_payload?: Json | null
          response_data?: Json | null
          response_status?: number | null
          status?: string
          task_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      credit_history: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_pack_definitions: {
        Row: {
          credits_amount: number
          plan_id: Database["public"]["Enums"]["plan_type"]
          price_cents: number
        }
        Insert: {
          credits_amount: number
          plan_id: Database["public"]["Enums"]["plan_type"]
          price_cents: number
        }
        Update: {
          credits_amount?: number
          plan_id?: Database["public"]["Enums"]["plan_type"]
          price_cents?: number
        }
        Relationships: []
      }
      cron_locks: {
        Row: {
          expires_at: string
          holder: string | null
          locked_at: string
          name: string
        }
        Insert: {
          expires_at: string
          holder?: string | null
          locked_at?: string
          name: string
        }
        Update: {
          expires_at?: string
          holder?: string | null
          locked_at?: string
          name?: string
        }
        Relationships: []
      }
      diagnostic_circuit_breakers: {
        Row: {
          failure_count: number | null
          last_failure_at: string | null
          next_test_at: string | null
          opened_at: string | null
          server_id: string
          state: string
          updated_at: string | null
        }
        Insert: {
          failure_count?: number | null
          last_failure_at?: string | null
          next_test_at?: string | null
          opened_at?: string | null
          server_id: string
          state?: string
          updated_at?: string | null
        }
        Update: {
          failure_count?: number | null
          last_failure_at?: string | null
          next_test_at?: string | null
          opened_at?: string | null
          server_id?: string
          state?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_circuit_breakers_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_concurrency_control: {
        Row: {
          active_count: number | null
          count_10m: number | null
          count_1h: number | null
          count_20s: number | null
          key: string
          last_request_at: string | null
          last_window_reset_10m: string | null
          last_window_reset_1h: string | null
          last_window_reset_20s: string | null
          updated_at: string | null
        }
        Insert: {
          active_count?: number | null
          count_10m?: number | null
          count_1h?: number | null
          count_20s?: number | null
          key: string
          last_request_at?: string | null
          last_window_reset_10m?: string | null
          last_window_reset_1h?: string | null
          last_window_reset_20s?: string | null
          updated_at?: string | null
        }
        Update: {
          active_count?: number | null
          count_10m?: number | null
          count_1h?: number | null
          count_20s?: number | null
          key?: string
          last_request_at?: string | null
          last_window_reset_10m?: string | null
          last_window_reset_1h?: string | null
          last_window_reset_20s?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      diagnostic_locks: {
        Row: {
          created_at: string | null
          lock_key: string
        }
        Insert: {
          created_at?: string | null
          lock_key: string
        }
        Update: {
          created_at?: string | null
          lock_key?: string
        }
        Relationships: []
      }
      dns_alerts: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          server_id: string
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          server_id: string
          severity?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          server_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "dns_alerts_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      dns_correlation_events: {
        Row: {
          confidence: number
          created_at: string
          failed_host: string | null
          group_key: string
          id: string
          offline_count: number
          online_count: number
          owner_id: string
          recovered_at: string | null
          recovery_seconds: number | null
          related: Json
          server_id: string
          summary: string | null
          total_count: number
          verdict: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          failed_host?: string | null
          group_key: string
          id?: string
          offline_count?: number
          online_count?: number
          owner_id: string
          recovered_at?: string | null
          recovery_seconds?: number | null
          related?: Json
          server_id: string
          summary?: string | null
          total_count?: number
          verdict: string
        }
        Update: {
          confidence?: number
          created_at?: string
          failed_host?: string | null
          group_key?: string
          id?: string
          offline_count?: number
          online_count?: number
          owner_id?: string
          recovered_at?: string | null
          recovery_seconds?: number | null
          related?: Json
          server_id?: string
          summary?: string | null
          total_count?: number
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "dns_correlation_events_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      dns_ip_history: {
        Row: {
          changed_at: string
          id: string
          new_asn: string | null
          new_ip: string | null
          old_asn: string | null
          old_ip: string | null
          record_type: string
          seconds_since_previous: number | null
          server_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_asn?: string | null
          new_ip?: string | null
          old_asn?: string | null
          old_ip?: string | null
          record_type?: string
          seconds_since_previous?: number | null
          server_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_asn?: string | null
          new_ip?: string | null
          old_asn?: string | null
          old_ip?: string | null
          record_type?: string
          seconds_since_previous?: number | null
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dns_ip_history_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      dns_snapshots: {
        Row: {
          asn: string | null
          avg_response_ms: number | null
          checked_at: string
          city: string | null
          cloudflare_proxy: boolean | null
          consistent: boolean | null
          country: string | null
          created_at: string
          datacenter: string | null
          diagnosis: string[] | null
          dnssec: boolean | null
          domain_expires_at: string | null
          health_score: number | null
          id: string
          ipv4: string[] | null
          ipv6: string[] | null
          max_response_ms: number | null
          min_response_ms: number | null
          nameservers: string[] | null
          org: string | null
          primary_ip: string | null
          propagation: Json
          propagation_pct: number | null
          records: Json
          registrar: string | null
          resolved_ok: number
          resolver_count: number
          resolvers: Json
          server_id: string
          status: string
          ttl_seconds: number | null
        }
        Insert: {
          asn?: string | null
          avg_response_ms?: number | null
          checked_at?: string
          city?: string | null
          cloudflare_proxy?: boolean | null
          consistent?: boolean | null
          country?: string | null
          created_at?: string
          datacenter?: string | null
          diagnosis?: string[] | null
          dnssec?: boolean | null
          domain_expires_at?: string | null
          health_score?: number | null
          id?: string
          ipv4?: string[] | null
          ipv6?: string[] | null
          max_response_ms?: number | null
          min_response_ms?: number | null
          nameservers?: string[] | null
          org?: string | null
          primary_ip?: string | null
          propagation?: Json
          propagation_pct?: number | null
          records?: Json
          registrar?: string | null
          resolved_ok?: number
          resolver_count?: number
          resolvers?: Json
          server_id: string
          status?: string
          ttl_seconds?: number | null
        }
        Update: {
          asn?: string | null
          avg_response_ms?: number | null
          checked_at?: string
          city?: string | null
          cloudflare_proxy?: boolean | null
          consistent?: boolean | null
          country?: string | null
          created_at?: string
          datacenter?: string | null
          diagnosis?: string[] | null
          dnssec?: boolean | null
          domain_expires_at?: string | null
          health_score?: number | null
          id?: string
          ipv4?: string[] | null
          ipv6?: string[] | null
          max_response_ms?: number | null
          min_response_ms?: number | null
          nameservers?: string[] | null
          org?: string | null
          primary_ip?: string | null
          propagation?: Json
          propagation_pct?: number | null
          records?: Json
          registrar?: string | null
          resolved_ok?: number
          resolver_count?: number
          resolvers?: Json
          server_id?: string
          status?: string
          ttl_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dns_snapshots_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      expiry_notices: {
        Row: {
          id: string
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      external_service_incidents: {
        Row: {
          created_at: string
          description: string | null
          id: string
          impact_assessment: string | null
          last_update_at: string
          resolved_at: string | null
          service_name: string
          source_url: string | null
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          impact_assessment?: string | null
          last_update_at?: string
          resolved_at?: string | null
          service_name: string
          source_url?: string | null
          started_at?: string
          status: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          impact_assessment?: string | null
          last_update_at?: string
          resolved_at?: string | null
          service_name?: string
          source_url?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      hub_profiles: {
        Row: {
          banned: boolean
          bio: string | null
          business_count: number
          created_at: string
          handle: string | null
          id: string
          location: string | null
          rating_avg: number
          rating_count: number
          updated_at: string
          verification_doc_path: string | null
          verification_status: Database["public"]["Enums"]["hub_verification_status"]
          verified_at: string | null
        }
        Insert: {
          banned?: boolean
          bio?: string | null
          business_count?: number
          created_at?: string
          handle?: string | null
          id: string
          location?: string | null
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          verification_doc_path?: string | null
          verification_status?: Database["public"]["Enums"]["hub_verification_status"]
          verified_at?: string | null
        }
        Update: {
          banned?: boolean
          bio?: string | null
          business_count?: number
          created_at?: string
          handle?: string | null
          id?: string
          location?: string | null
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          verification_doc_path?: string | null
          verification_status?: Database["public"]["Enums"]["hub_verification_status"]
          verified_at?: string | null
        }
        Relationships: []
      }
      hub_reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          reason: Database["public"]["Enums"]["hub_report_reason"]
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          target_id: string
          target_kind: Database["public"]["Enums"]["hub_report_target"]
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          reason: Database["public"]["Enums"]["hub_report_reason"]
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          target_id: string
          target_kind: Database["public"]["Enums"]["hub_report_target"]
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["hub_report_reason"]
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          target_id?: string
          target_kind?: Database["public"]["Enums"]["hub_report_target"]
        }
        Relationships: []
      }
      incidents: {
        Row: {
          alert_sent: boolean
          ended_at: string | null
          failure_count: number
          id: string
          last_check_at: string | null
          notified: boolean
          reason: string | null
          regions: string | null
          server_id: string
          started_at: string
        }
        Insert: {
          alert_sent?: boolean
          ended_at?: string | null
          failure_count?: number
          id?: string
          last_check_at?: string | null
          notified?: boolean
          reason?: string | null
          regions?: string | null
          server_id: string
          started_at?: string
        }
        Update: {
          alert_sent?: boolean
          ended_at?: string | null
          failure_count?: number
          id?: string
          last_check_at?: string | null
          notified?: boolean
          reason?: string | null
          regions?: string | null
          server_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_alert_state: {
        Row: {
          active: boolean
          created_at: string
          first_seen_at: string | null
          id: string
          kind: string
          last_seen_at: string | null
          notified_at: string | null
          pending_count: number
          resolved_at: string | null
          server_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          first_seen_at?: string | null
          id?: string
          kind: string
          last_seen_at?: string | null
          notified_at?: string | null
          pending_count?: number
          resolved_at?: string | null
          server_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          first_seen_at?: string | null
          id?: string
          kind?: string
          last_seen_at?: string | null
          notified_at?: string | null
          pending_count?: number
          resolved_at?: string | null
          server_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_alert_state_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_alerts: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          server_id: string
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          server_id: string
          severity?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          server_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_alerts_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_catalog_changes: {
        Row: {
          action: string
          category: string | null
          detected_at: string
          external_id: string | null
          id: number
          kind: Database["public"]["Enums"]["iptv_stream_kind"]
          name: string
          server_id: string
        }
        Insert: {
          action: string
          category?: string | null
          detected_at?: string
          external_id?: string | null
          id?: never
          kind: Database["public"]["Enums"]["iptv_stream_kind"]
          name: string
          server_id: string
        }
        Update: {
          action?: string
          category?: string | null
          detected_at?: string
          external_id?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["iptv_stream_kind"]
          name?: string
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_catalog_changes_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_catalog_daily: {
        Row: {
          added_channels: number
          added_movies: number
          added_series: number
          channels: number
          created_at: string
          day: string
          movies: number
          removed_count: number
          series: number
          server_id: string
          sync_ms: number | null
          updated_at: string
        }
        Insert: {
          added_channels?: number
          added_movies?: number
          added_series?: number
          channels?: number
          created_at?: string
          day: string
          movies?: number
          removed_count?: number
          series?: number
          server_id: string
          sync_ms?: number | null
          updated_at?: string
        }
        Update: {
          added_channels?: number
          added_movies?: number
          added_series?: number
          channels?: number
          created_at?: string
          day?: string
          movies?: number
          removed_count?: number
          series?: number
          server_id?: string
          sync_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_catalog_daily_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_catalog_items: {
        Row: {
          category: string | null
          created_at: string
          external_id: string
          first_seen_at: string
          id: number
          kind: Database["public"]["Enums"]["iptv_stream_kind"]
          last_seen_at: string
          name: string
          removed_at: string | null
          server_id: string
          title_key: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          external_id: string
          first_seen_at?: string
          id?: never
          kind: Database["public"]["Enums"]["iptv_stream_kind"]
          last_seen_at?: string
          name: string
          removed_at?: string | null
          server_id: string
          title_key: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          external_id?: string
          first_seen_at?: string
          id?: never
          kind?: Database["public"]["Enums"]["iptv_stream_kind"]
          last_seen_at?: string
          name?: string
          removed_at?: string | null
          server_id?: string
          title_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_catalog_items_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_catalog_matches: {
        Row: {
          catalog_id: string | null
          detected_at: string | null
          external_id: string
          id: string
          raw_name: string
          server_id: string | null
        }
        Insert: {
          catalog_id?: string | null
          detected_at?: string | null
          external_id: string
          id?: string
          raw_name: string
          server_id?: string | null
        }
        Update: {
          catalog_id?: string | null
          detected_at?: string | null
          external_id?: string
          id?: string
          raw_name?: string
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iptv_catalog_matches_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "iptv_global_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iptv_catalog_matches_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_cluster_members: {
        Row: {
          cluster_id: string
          confidence: number
          matched_at: string
          server_id: string
          signals: Json
        }
        Insert: {
          cluster_id: string
          confidence?: number
          matched_at?: string
          server_id: string
          signals?: Json
        }
        Update: {
          cluster_id?: string
          confidence?: number
          matched_at?: string
          server_id?: string
          signals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "iptv_cluster_members_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "iptv_server_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iptv_cluster_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_global_catalog: {
        Row: {
          first_detected_at: string | null
          first_server_id: string | null
          id: string
          is_rare: boolean | null
          last_detected_at: string | null
          media_type: string
          normalized_name: string
          poster_path: string | null
          release_year: number | null
          servers_found_count: number | null
          title_key: string
          tmdb_checked_at: string | null
          tmdb_id: number | null
          tmdb_status: string
          vote_average: number | null
        }
        Insert: {
          first_detected_at?: string | null
          first_server_id?: string | null
          id?: string
          is_rare?: boolean | null
          last_detected_at?: string | null
          media_type: string
          normalized_name: string
          poster_path?: string | null
          release_year?: number | null
          servers_found_count?: number | null
          title_key: string
          tmdb_checked_at?: string | null
          tmdb_id?: number | null
          tmdb_status?: string
          vote_average?: number | null
        }
        Update: {
          first_detected_at?: string | null
          first_server_id?: string | null
          id?: string
          is_rare?: boolean | null
          last_detected_at?: string | null
          media_type?: string
          normalized_name?: string
          poster_path?: string | null
          release_year?: number | null
          servers_found_count?: number | null
          title_key?: string
          tmdb_checked_at?: string | null
          tmdb_id?: number | null
          tmdb_status?: string
          vote_average?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "iptv_global_catalog_first_server_id_fkey"
            columns: ["first_server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_ip_history: {
        Row: {
          changed_at: string
          city: string | null
          country: string | null
          datacenter: string | null
          id: string
          isp: string | null
          new_asn: string | null
          new_ip: string | null
          old_asn: string | null
          old_ip: string | null
          server_id: string
        }
        Insert: {
          changed_at?: string
          city?: string | null
          country?: string | null
          datacenter?: string | null
          id?: string
          isp?: string | null
          new_asn?: string | null
          new_ip?: string | null
          old_asn?: string | null
          old_ip?: string | null
          server_id: string
        }
        Update: {
          changed_at?: string
          city?: string | null
          country?: string | null
          datacenter?: string | null
          id?: string
          isp?: string | null
          new_asn?: string | null
          new_ip?: string | null
          old_asn?: string | null
          old_ip?: string | null
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_ip_history_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_login_attempts: {
        Row: {
          blocked_until: string | null
          created_at: string
          failures: number
          last_attempt_at: string | null
          last_failure_at: string | null
          last_reason: string | null
          server_id: string
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          failures?: number
          last_attempt_at?: string | null
          last_failure_at?: string | null
          last_reason?: string | null
          server_id: string
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          failures?: number
          last_attempt_at?: string | null
          last_failure_at?: string | null
          last_reason?: string | null
          server_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_login_attempts_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_notification_queue: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_first_detection: boolean | null
          is_rare: boolean | null
          kind: string
          name: string
          owner_id: string
          sent_at: string | null
          server_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_first_detection?: boolean | null
          is_rare?: boolean | null
          kind: string
          name: string
          owner_id: string
          sent_at?: string | null
          server_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_first_detection?: boolean | null
          is_rare?: boolean | null
          kind?: string
          name?: string
          owner_id?: string
          sent_at?: string | null
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_notification_queue_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_server_clusters: {
        Row: {
          created_at: string
          id: string
          members_count: number
          name: string
          primary_server_id: string | null
          signals: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          members_count?: number
          name: string
          primary_server_id?: string | null
          signals?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          members_count?: number
          name?: string
          primary_server_id?: string | null
          signals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_server_clusters_primary_server_id_fkey"
            columns: ["primary_server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_stream_tests: {
        Row: {
          bitrate_kbps: number | null
          buffer_ms: number | null
          codec: string | null
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["iptv_stream_kind"]
          label: string | null
          ok: boolean
          resolution: string | null
          server_id: string
          start_ms: number | null
          sync_id: string | null
          tested_at: string
          total_ms: number | null
        }
        Insert: {
          bitrate_kbps?: number | null
          buffer_ms?: number | null
          codec?: string | null
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["iptv_stream_kind"]
          label?: string | null
          ok?: boolean
          resolution?: string | null
          server_id: string
          start_ms?: number | null
          sync_id?: string | null
          tested_at?: string
          total_ms?: number | null
        }
        Update: {
          bitrate_kbps?: number | null
          buffer_ms?: number | null
          codec?: string | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["iptv_stream_kind"]
          label?: string | null
          ok?: boolean
          resolution?: string | null
          server_id?: string
          start_ms?: number | null
          sync_id?: string | null
          tested_at?: string
          total_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "iptv_stream_tests_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iptv_stream_tests_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "iptv_syncs"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_sync_job_items: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          job_id: string
          movies: number
          series: number
          server_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id: string
          movies?: number
          series?: number
          server_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string
          movies?: number
          series?: number
          server_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_sync_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "iptv_sync_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iptv_sync_job_items_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      iptv_sync_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          failed_count: number
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          movies_found: number
          processed: number
          series_found: number
          started_at: string | null
          status: string
          success_count: number
          total_servers: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          movies_found?: number
          processed?: number
          series_found?: number
          started_at?: string | null
          status?: string
          success_count?: number
          total_servers?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          movies_found?: number
          processed?: number
          series_found?: number
          started_at?: string | null
          status?: string
          success_count?: number
          total_servers?: number
          updated_at?: string
        }
        Relationships: []
      }
      iptv_syncs: {
        Row: {
          api_ms: number | null
          asn: string | null
          avg_region_ms: number | null
          categories: number | null
          channels: number | null
          created_at: string
          datacenter: string | null
          diagnostics: Json | null
          error: string | null
          fastest_region: string | null
          health_score: number | null
          id: string
          ip: string | null
          json_valid: boolean | null
          latency_ms: number | null
          login_checked: boolean
          login_ok: boolean | null
          m3u_bytes: number | null
          m3u_channels: number | null
          m3u_groups: number | null
          mode: Database["public"]["Enums"]["iptv_mode"]
          movies: number | null
          playlist_ok: boolean | null
          series: number | null
          server_id: string
          slowest_region: string | null
          synced_at: string
        }
        Insert: {
          api_ms?: number | null
          asn?: string | null
          avg_region_ms?: number | null
          categories?: number | null
          channels?: number | null
          created_at?: string
          datacenter?: string | null
          diagnostics?: Json | null
          error?: string | null
          fastest_region?: string | null
          health_score?: number | null
          id?: string
          ip?: string | null
          json_valid?: boolean | null
          latency_ms?: number | null
          login_checked?: boolean
          login_ok?: boolean | null
          m3u_bytes?: number | null
          m3u_channels?: number | null
          m3u_groups?: number | null
          mode?: Database["public"]["Enums"]["iptv_mode"]
          movies?: number | null
          playlist_ok?: boolean | null
          series?: number | null
          server_id: string
          slowest_region?: string | null
          synced_at?: string
        }
        Update: {
          api_ms?: number | null
          asn?: string | null
          avg_region_ms?: number | null
          categories?: number | null
          channels?: number | null
          created_at?: string
          datacenter?: string | null
          diagnostics?: Json | null
          error?: string | null
          fastest_region?: string | null
          health_score?: number | null
          id?: string
          ip?: string | null
          json_valid?: boolean | null
          latency_ms?: number | null
          login_checked?: boolean
          login_ok?: boolean | null
          m3u_bytes?: number | null
          m3u_channels?: number | null
          m3u_groups?: number | null
          mode?: Database["public"]["Enums"]["iptv_mode"]
          movies?: number | null
          playlist_ok?: boolean | null
          series?: number | null
          server_id?: string
          slowest_region?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iptv_syncs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      kuma_heartbeats: {
        Row: {
          checked_at: string
          id: number
          kind: string
          latency_ms: number | null
          message: string | null
          ok: boolean
          server_id: string
        }
        Insert: {
          checked_at?: string
          id?: number
          kind: string
          latency_ms?: number | null
          message?: string | null
          ok: boolean
          server_id: string
        }
        Update: {
          checked_at?: string
          id?: number
          kind?: string
          latency_ms?: number | null
          message?: string | null
          ok?: boolean
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kuma_heartbeats_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      kuma_heartbeats_daily: {
        Row: {
          avg_latency_ms: number | null
          created_at: string
          day: string
          kind: string
          ok_count: number
          server_id: string
          total: number
          uptime_pct: number | null
        }
        Insert: {
          avg_latency_ms?: number | null
          created_at?: string
          day: string
          kind: string
          ok_count?: number
          server_id: string
          total?: number
          uptime_pct?: number | null
        }
        Update: {
          avg_latency_ms?: number | null
          created_at?: string
          day?: string
          kind?: string
          ok_count?: number
          server_id?: string
          total?: number
          uptime_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kuma_heartbeats_daily_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      kuma_heartbeats_hourly: {
        Row: {
          avg_latency_ms: number | null
          created_at: string
          hour: string
          kind: string
          max_latency_ms: number | null
          ok_count: number
          server_id: string
          total: number
        }
        Insert: {
          avg_latency_ms?: number | null
          created_at?: string
          hour: string
          kind: string
          max_latency_ms?: number | null
          ok_count?: number
          server_id: string
          total?: number
        }
        Update: {
          avg_latency_ms?: number | null
          created_at?: string
          hour?: string
          kind?: string
          max_latency_ms?: number | null
          ok_count?: number
          server_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "kuma_heartbeats_hourly_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      kuma_incidents: {
        Row: {
          created_at: string
          duration_s: number | null
          ended_at: string | null
          id: string
          kind: string
          reason: string | null
          server_id: string
          started_at: string
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          ended_at?: string | null
          id?: string
          kind: string
          reason?: string | null
          server_id: string
          started_at?: string
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          ended_at?: string | null
          id?: string
          kind?: string
          reason?: string | null
          server_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kuma_incidents_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      kuma_monitor_status: {
        Row: {
          active: boolean
          avg_latency_ms: number | null
          cert_days_remaining: number | null
          cert_expires_at: string | null
          created_at: string
          id: string
          kind: string
          last_check_at: string | null
          last_down_duration_s: number | null
          last_down_started_at: string | null
          latency_ms: number | null
          message: string | null
          monitor_id: number | null
          resolved_ip: string | null
          server_id: string
          status: string
          updated_at: string
          uptime_24h: number | null
          uptime_30d: number | null
          uptime_7d: number | null
        }
        Insert: {
          active?: boolean
          avg_latency_ms?: number | null
          cert_days_remaining?: number | null
          cert_expires_at?: string | null
          created_at?: string
          id?: string
          kind: string
          last_check_at?: string | null
          last_down_duration_s?: number | null
          last_down_started_at?: string | null
          latency_ms?: number | null
          message?: string | null
          monitor_id?: number | null
          resolved_ip?: string | null
          server_id: string
          status?: string
          updated_at?: string
          uptime_24h?: number | null
          uptime_30d?: number | null
          uptime_7d?: number | null
        }
        Update: {
          active?: boolean
          avg_latency_ms?: number | null
          cert_days_remaining?: number | null
          cert_expires_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_check_at?: string | null
          last_down_duration_s?: number | null
          last_down_started_at?: string | null
          latency_ms?: number | null
          message?: string | null
          monitor_id?: number | null
          resolved_ip?: string | null
          server_id?: string
          status?: string
          updated_at?: string
          uptime_24h?: number | null
          uptime_30d?: number | null
          uptime_7d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kuma_monitor_status_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          author_id: string
          category: Database["public"]["Enums"]["listing_category"]
          created_at: string
          currency: string
          description: string
          flagged: boolean
          highlight: boolean
          id: string
          kind: Database["public"]["Enums"]["listing_kind"]
          location: string | null
          price_cents: number | null
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          currency?: string
          description: string
          flagged?: boolean
          highlight?: boolean
          id?: string
          kind: Database["public"]["Enums"]["listing_kind"]
          location?: string | null
          price_cents?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          currency?: string
          description?: string
          flagged?: boolean
          highlight?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          location?: string | null
          price_cents?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_activity_log: {
        Row: {
          args: Json | null
          client_id: string | null
          created_at: string
          detail: string | null
          id: string
          outcome: string
          tool: string
          user_id: string
        }
        Insert: {
          args?: Json | null
          client_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          outcome: string
          tool: string
          user_id: string
        }
        Update: {
          args?: Json | null
          client_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          outcome?: string
          tool?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: Json | null
          body: string
          contact_shared: boolean
          conversation_id: string
          created_at: string
          flagged: boolean
          id: string
          sender_id: string
        }
        Insert: {
          attachments?: Json | null
          body: string
          contact_shared?: boolean
          conversation_id: string
          created_at?: string
          flagged?: boolean
          id?: string
          sender_id: string
        }
        Update: {
          attachments?: Json | null
          body?: string
          contact_shared?: boolean
          conversation_id?: string
          created_at?: string
          flagged?: boolean
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitored_contents: {
        Row: {
          category_name: string | null
          consecutive_failures: number
          container_ext: string | null
          content_type: Database["public"]["Enums"]["content_kind"]
          cover_url: string | null
          created_at: string
          current_status: Database["public"]["Enums"]["content_status"]
          episode_number: number | null
          external_content_id: string
          first_seen_at: string
          http_status: number | null
          id: string
          is_favorite: boolean
          last_checked_at: string | null
          last_error: string | null
          last_online_at: string | null
          last_seen_at: string
          name: string
          parent_external_id: string | null
          priority: number
          reseller_id: string
          response_time_ms: number | null
          season_number: number | null
          server_id: string
          stream_url_encrypted: string | null
          updated_at: string
        }
        Insert: {
          category_name?: string | null
          consecutive_failures?: number
          container_ext?: string | null
          content_type: Database["public"]["Enums"]["content_kind"]
          cover_url?: string | null
          created_at?: string
          current_status?: Database["public"]["Enums"]["content_status"]
          episode_number?: number | null
          external_content_id: string
          first_seen_at?: string
          http_status?: number | null
          id?: string
          is_favorite?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          last_online_at?: string | null
          last_seen_at?: string
          name: string
          parent_external_id?: string | null
          priority?: number
          reseller_id: string
          response_time_ms?: number | null
          season_number?: number | null
          server_id: string
          stream_url_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          category_name?: string | null
          consecutive_failures?: number
          container_ext?: string | null
          content_type?: Database["public"]["Enums"]["content_kind"]
          cover_url?: string | null
          created_at?: string
          current_status?: Database["public"]["Enums"]["content_status"]
          episode_number?: number | null
          external_content_id?: string
          first_seen_at?: string
          http_status?: number | null
          id?: string
          is_favorite?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          last_online_at?: string | null
          last_seen_at?: string
          name?: string
          parent_external_id?: string | null
          priority?: number
          reseller_id?: string
          response_time_ms?: number | null
          season_number?: number | null
          server_id?: string
          stream_url_encrypted?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitored_contents_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          channel_id: string
          created_at: string | null
          event: string
          id: string
          message: string
          owner_id: string
          processed: boolean | null
          server_id: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          event: string
          id?: string
          message: string
          owner_id: string
          processed?: boolean | null
          server_id?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          event?: string
          id?: string
          message?: string
          owner_id?: string
          processed?: boolean | null
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "alert_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          channel_id: string | null
          event: string
          id: number
          incident_id: string | null
          ok: boolean
          response: string | null
          sent_at: string
          server_id: string | null
        }
        Insert: {
          channel_id?: string | null
          event: string
          id?: number
          incident_id?: string | null
          ok: boolean
          response?: string | null
          sent_at?: string
          server_id?: string | null
        }
        Update: {
          channel_id?: string | null
          event?: string
          id?: number
          incident_id?: string | null
          ok?: boolean
          response?: string | null
          sent_at?: string
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "alert_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string | null
          payment_type: string | null
          pix_copy_paste: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          plan: string | null
          provider: string
          provider_payment_id: string | null
          raw_payload: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          store_product_id: string | null
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          payment_type?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          plan?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_product_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          payment_type?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          plan?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_product_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_store_product_id_fkey"
            columns: ["store_product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          admin_note: string | null
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          paid_at: string | null
          pix_key: string
          pix_name: string
          pix_type: string
          rejected_at: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          pix_key: string
          pix_name: string
          pix_type: string
          rejected_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          pix_key?: string
          pix_name?: string
          pix_type?: string
          rejected_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_favorites: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          session_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          session_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_favorites_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "player_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_history: {
        Row: {
          content_id: string
          content_type: string
          duration_seconds: number | null
          id: string
          last_position_seconds: number | null
          session_id: string
          watched_at: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          duration_seconds?: number | null
          id?: string
          last_position_seconds?: number | null
          session_id: string
          watched_at?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          duration_seconds?: number | null
          id?: string
          last_position_seconds?: number | null
          session_id?: string
          watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "player_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_sessions: {
        Row: {
          created_at: string | null
          device_info: Json | null
          expires_at: string
          id: string
          last_active_at: string | null
          last_ip: unknown
          reseller_id: string
          server_id: string
          token: string
          xtream_pass: string | null
          xtream_user: string
        }
        Insert: {
          created_at?: string | null
          device_info?: Json | null
          expires_at: string
          id?: string
          last_active_at?: string | null
          last_ip?: unknown
          reseller_id: string
          server_id: string
          token: string
          xtream_pass?: string | null
          xtream_user: string
        }
        Update: {
          created_at?: string | null
          device_info?: Json | null
          expires_at?: string
          id?: string
          last_active_at?: string | null
          last_ip?: unknown
          reseller_id?: string
          server_id?: string
          token?: string
          xtream_pass?: string | null
          xtream_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_sessions_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_sessions_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      player_settings: {
        Row: {
          brand_name: string | null
          created_at: string | null
          custom_domain: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          primary_color: string | null
          profile_id: string
          secondary_color: string | null
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          brand_name?: string | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          primary_color?: string | null
          profile_id: string
          secondary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          brand_name?: string | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          primary_color?: string | null
          profile_id?: string
          secondary_color?: string | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits: number | null
          email: string | null
          full_name: string | null
          id: string
          is_reseller: boolean | null
          owner_account_id: string | null
          parent_id: string | null
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          signup_bonus_days: number
          telegram_alert_style: string | null
          telegram_iptv_style: string | null
          trial_used: boolean
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits?: number | null
          email?: string | null
          full_name?: string | null
          id: string
          is_reseller?: boolean | null
          owner_account_id?: string | null
          parent_id?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          signup_bonus_days?: number
          telegram_alert_style?: string | null
          telegram_iptv_style?: string | null
          trial_used?: boolean
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_reseller?: boolean | null
          owner_account_id?: string | null
          parent_id?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          signup_bonus_days?: number
          telegram_alert_style?: string | null
          telegram_iptv_style?: string | null
          trial_used?: boolean
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          comment: string | null
          conversation_id: string
          created_at: string
          id: string
          ratee_id: string
          rater_id: string
          stars: number
        }
        Insert: {
          comment?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          ratee_id: string
          rater_id: string
          stars: number
        }
        Update: {
          comment?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          ratee_id?: string
          rater_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      reactivation_campaign_settings: {
        Row: {
          created_at: string | null
          id: string
          last_message: string | null
          last_sent_at: string | null
          total_failed: number | null
          total_sent: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_sent_at?: string | null
          total_failed?: number | null
          total_sent?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_sent_at?: string | null
          total_failed?: number | null
          total_sent?: number | null
        }
        Relationships: []
      }
      reactivation_campaigns: {
        Row: {
          created_by: string | null
          error_log: string | null
          finished_at: string | null
          id: string
          message: string | null
          started_at: string
          status: string
          total_failed: number | null
          total_found: number | null
          total_sent: number | null
          total_skipped: number | null
        }
        Insert: {
          created_by?: string | null
          error_log?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          started_at?: string
          status?: string
          total_failed?: number | null
          total_found?: number | null
          total_sent?: number | null
          total_skipped?: number | null
        }
        Update: {
          created_by?: string | null
          error_log?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          started_at?: string
          status?: string
          total_failed?: number | null
          total_found?: number | null
          total_sent?: number | null
          total_skipped?: number | null
        }
        Relationships: []
      }
      reactivation_logs: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          message_version: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_version?: string | null
          status: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_version?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reactivation_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          approved_at: string | null
          code_used: string
          converted_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          payout_request_id: string | null
          referred_id: string
          referrer_id: string
          requested_at: string | null
          reward_cents: number
          reward_granted_at: string | null
          status: string
          subscribed_at: string | null
        }
        Insert: {
          approved_at?: string | null
          code_used: string
          converted_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payout_request_id?: string | null
          referred_id: string
          referrer_id: string
          requested_at?: string | null
          reward_cents?: number
          reward_granted_at?: string | null
          status?: string
          subscribed_at?: string | null
        }
        Update: {
          approved_at?: string | null
          code_used?: string
          converted_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payout_request_id?: string | null
          referred_id?: string
          referrer_id?: string
          requested_at?: string | null
          reward_cents?: number
          reward_granted_at?: string | null
          status?: string
          subscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_payout_request_fk"
            columns: ["payout_request_id"]
            isOneToOne: false
            referencedRelation: "payout_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      region_agents: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_report_count: number
          last_seen_at: string | null
          name: string
          region_code: string
          secret_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_report_count?: number
          last_seen_at?: string | null
          name: string
          region_code: string
          secret_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_report_count?: number
          last_seen_at?: string | null
          name?: string
          region_code?: string
          secret_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_agents_region_code_fkey"
            columns: ["region_code"]
            isOneToOne: false
            referencedRelation: "check_regions"
            referencedColumns: ["code"]
          },
        ]
      }
      region_checks: {
        Row: {
          checked_at: string
          details: Json
          error: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          region_code: string
          server_id: string
          source: string
          status: string
        }
        Insert: {
          checked_at?: string
          details?: Json
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          region_code: string
          server_id: string
          source?: string
          status: string
        }
        Update: {
          checked_at?: string
          details?: Json
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          region_code?: string
          server_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_checks_region_code_fkey"
            columns: ["region_code"]
            isOneToOne: false
            referencedRelation: "check_regions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "region_checks_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      region_checks_daily: {
        Row: {
          avg_latency_ms: number | null
          created_at: string
          day: string
          downs: number
          downtime_minutes: number
          max_latency_ms: number | null
          region_code: string
          server_id: string
          total: number
          ups: number
          uptime_pct: number | null
        }
        Insert: {
          avg_latency_ms?: number | null
          created_at?: string
          day: string
          downs?: number
          downtime_minutes?: number
          max_latency_ms?: number | null
          region_code: string
          server_id: string
          total?: number
          ups?: number
          uptime_pct?: number | null
        }
        Update: {
          avg_latency_ms?: number | null
          created_at?: string
          day?: string
          downs?: number
          downtime_minutes?: number
          max_latency_ms?: number | null
          region_code?: string
          server_id?: string
          total?: number
          ups?: number
          uptime_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "region_checks_daily_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      region_checks_hourly: {
        Row: {
          avg_latency_ms: number | null
          created_at: string
          downs: number
          hour: string
          max_latency_ms: number | null
          region_code: string
          server_id: string
          total: number
          ups: number
        }
        Insert: {
          avg_latency_ms?: number | null
          created_at?: string
          downs?: number
          hour: string
          max_latency_ms?: number | null
          region_code: string
          server_id: string
          total?: number
          ups?: number
        }
        Update: {
          avg_latency_ms?: number | null
          created_at?: string
          downs?: number
          hour?: string
          max_latency_ms?: number | null
          region_code?: string
          server_id?: string
          total?: number
          ups?: number
        }
        Relationships: [
          {
            foreignKeyName: "region_checks_hourly_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_catalog_stats: {
        Row: {
          last_sync_at: string | null
          server_id: string
          total_contents: number | null
          updates_last_7d: number | null
        }
        Insert: {
          last_sync_at?: string | null
          server_id: string
          total_contents?: number | null
          updates_last_7d?: number | null
        }
        Update: {
          last_sync_at?: string | null
          server_id?: string
          total_contents?: number | null
          updates_last_7d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_catalog_stats_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_credit_history: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      reseller_pages: {
        Row: {
          accent_color: string
          created_at: string
          display_name: string
          id: string
          intro: string | null
          logo_url: string | null
          owner_id: string
          primary_color: string
          published: boolean
          show_dns: boolean
          show_novidades: boolean
          show_servers: boolean
          slug: string
          tagline: string
          telegram: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          accent_color?: string
          created_at?: string
          display_name: string
          id?: string
          intro?: string | null
          logo_url?: string | null
          owner_id: string
          primary_color?: string
          published?: boolean
          show_dns?: boolean
          show_novidades?: boolean
          show_servers?: boolean
          slug: string
          tagline?: string
          telegram?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          accent_color?: string
          created_at?: string
          display_name?: string
          id?: string
          intro?: string | null
          logo_url?: string | null
          owner_id?: string
          primary_color?: string
          published?: boolean
          show_dns?: boolean
          show_novidades?: boolean
          show_servers?: boolean
          slug?: string
          tagline?: string
          telegram?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      reseller_plans: {
        Row: {
          created_at: string | null
          credits_amount: number | null
          duration_days: number
          id: string
          kind: string
          name: string
          price_cents: number
          reseller_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits_amount?: number | null
          duration_days: number
          id?: string
          kind?: string
          name: string
          price_cents: number
          reseller_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits_amount?: number | null
          duration_days?: number
          id?: string
          kind?: string
          name?: string
          price_cents?: number
          reseller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_plans_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_settings: {
        Row: {
          annual_price_cents: number | null
          created_at: string
          id: string
          monthly_price_cents: number | null
          pix_key: string | null
          pix_name: string | null
          quarterly_price_cents: number | null
          reseller_id: string
          updated_at: string
        }
        Insert: {
          annual_price_cents?: number | null
          created_at?: string
          id?: string
          monthly_price_cents?: number | null
          pix_key?: string | null
          pix_name?: string | null
          quarterly_price_cents?: number | null
          reseller_id: string
          updated_at?: string
        }
        Update: {
          annual_price_cents?: number | null
          created_at?: string
          id?: string
          monthly_price_cents?: number | null
          pix_key?: string | null
          pix_name?: string | null
          quarterly_price_cents?: number | null
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_settings_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_tree: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          parent_reseller_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          parent_reseller_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          parent_reseller_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_tree_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_tree_parent_reseller_id_fkey"
            columns: ["parent_reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_tree_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_wallet: {
        Row: {
          credits: number
          id: string
          reseller_id: string
          updated_at: string
        }
        Insert: {
          credits?: number
          id?: string
          reseller_id: string
          updated_at?: string
        }
        Update: {
          credits?: number
          id?: string
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_wallet_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      server_analysis: {
        Row: {
          analyzed_at: string
          asn: string | null
          cdn_provider: string | null
          cert_history: Json | null
          city: string | null
          country: string | null
          ipv4: string[] | null
          ipv6: string[] | null
          is_cloudflare: boolean | null
          nameservers: string[] | null
          org: string | null
          raw: Json | null
          response_ms: number | null
          server_id: string
          ssl_algorithm: string | null
          ssl_expires_at: string | null
          ssl_issuer: string | null
          ttl_seconds: number | null
        }
        Insert: {
          analyzed_at?: string
          asn?: string | null
          cdn_provider?: string | null
          cert_history?: Json | null
          city?: string | null
          country?: string | null
          ipv4?: string[] | null
          ipv6?: string[] | null
          is_cloudflare?: boolean | null
          nameservers?: string[] | null
          org?: string | null
          raw?: Json | null
          response_ms?: number | null
          server_id: string
          ssl_algorithm?: string | null
          ssl_expires_at?: string | null
          ssl_issuer?: string | null
          ttl_seconds?: number | null
        }
        Update: {
          analyzed_at?: string
          asn?: string | null
          cdn_provider?: string | null
          cert_history?: Json | null
          city?: string | null
          country?: string | null
          ipv4?: string[] | null
          ipv6?: string[] | null
          is_cloudflare?: boolean | null
          nameservers?: string[] | null
          org?: string | null
          raw?: Json | null
          response_ms?: number | null
          server_id?: string
          ssl_algorithm?: string | null
          ssl_expires_at?: string | null
          ssl_issuer?: string | null
          ttl_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "server_analysis_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: true
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          catalog_hash: string | null
          catalog_sync_ms: number | null
          catalog_synced_at: string | null
          category: string | null
          consecutive_failures: number
          created_at: string
          current_status: Database["public"]["Enums"]["server_status"]
          description: string | null
          dns_enabled: boolean
          dns_health_score: number | null
          dns_interval_minutes: number
          failure_threshold: number
          health_score: number | null
          host: string
          id: string
          interval_seconds: number
          iptv_detected: Database["public"]["Enums"]["iptv_kind"]
          iptv_interval_minutes: number
          iptv_mode: Database["public"]["Enums"]["iptv_mode"]
          iptv_password: string | null
          iptv_sample_size: number
          iptv_stream_tests: boolean
          iptv_username: string | null
          is_public: boolean
          kuma_api_id: number | null
          kuma_dns_id: number | null
          kuma_enabled: boolean
          kuma_error: string | null
          kuma_http_id: number | null
          kuma_ping_id: number | null
          kuma_ssl_id: number | null
          kuma_synced_at: string | null
          kuma_tcp_id: number | null
          kuma_tcp_port: number
          last_checked_at: string | null
          last_dns_check_at: string | null
          last_iptv_sync_at: string | null
          last_latency_ms: number | null
          monitoring_paused: boolean
          name: string
          owner_id: string
          paused_at: string | null
          paused_reason: string | null
          public_display_name: string | null
          public_dns_label: string | null
          public_slug: string | null
          server_group: string | null
          show_on_reseller_page: boolean
          ssl_days_remaining: number | null
          updated_at: string
        }
        Insert: {
          catalog_hash?: string | null
          catalog_sync_ms?: number | null
          catalog_synced_at?: string | null
          category?: string | null
          consecutive_failures?: number
          created_at?: string
          current_status?: Database["public"]["Enums"]["server_status"]
          description?: string | null
          dns_enabled?: boolean
          dns_health_score?: number | null
          dns_interval_minutes?: number
          failure_threshold?: number
          health_score?: number | null
          host: string
          id?: string
          interval_seconds?: number
          iptv_detected?: Database["public"]["Enums"]["iptv_kind"]
          iptv_interval_minutes?: number
          iptv_mode?: Database["public"]["Enums"]["iptv_mode"]
          iptv_password?: string | null
          iptv_sample_size?: number
          iptv_stream_tests?: boolean
          iptv_username?: string | null
          is_public?: boolean
          kuma_api_id?: number | null
          kuma_dns_id?: number | null
          kuma_enabled?: boolean
          kuma_error?: string | null
          kuma_http_id?: number | null
          kuma_ping_id?: number | null
          kuma_ssl_id?: number | null
          kuma_synced_at?: string | null
          kuma_tcp_id?: number | null
          kuma_tcp_port?: number
          last_checked_at?: string | null
          last_dns_check_at?: string | null
          last_iptv_sync_at?: string | null
          last_latency_ms?: number | null
          monitoring_paused?: boolean
          name: string
          owner_id: string
          paused_at?: string | null
          paused_reason?: string | null
          public_display_name?: string | null
          public_dns_label?: string | null
          public_slug?: string | null
          server_group?: string | null
          show_on_reseller_page?: boolean
          ssl_days_remaining?: number | null
          updated_at?: string
        }
        Update: {
          catalog_hash?: string | null
          catalog_sync_ms?: number | null
          catalog_synced_at?: string | null
          category?: string | null
          consecutive_failures?: number
          created_at?: string
          current_status?: Database["public"]["Enums"]["server_status"]
          description?: string | null
          dns_enabled?: boolean
          dns_health_score?: number | null
          dns_interval_minutes?: number
          failure_threshold?: number
          health_score?: number | null
          host?: string
          id?: string
          interval_seconds?: number
          iptv_detected?: Database["public"]["Enums"]["iptv_kind"]
          iptv_interval_minutes?: number
          iptv_mode?: Database["public"]["Enums"]["iptv_mode"]
          iptv_password?: string | null
          iptv_sample_size?: number
          iptv_stream_tests?: boolean
          iptv_username?: string | null
          is_public?: boolean
          kuma_api_id?: number | null
          kuma_dns_id?: number | null
          kuma_enabled?: boolean
          kuma_error?: string | null
          kuma_http_id?: number | null
          kuma_ping_id?: number | null
          kuma_ssl_id?: number | null
          kuma_synced_at?: string | null
          kuma_tcp_id?: number | null
          kuma_tcp_port?: number
          last_checked_at?: string | null
          last_dns_check_at?: string | null
          last_iptv_sync_at?: string | null
          last_latency_ms?: number | null
          monitoring_paused?: boolean
          name?: string
          owner_id?: string
          paused_at?: string | null
          paused_reason?: string | null
          public_display_name?: string | null
          public_dns_label?: string | null
          public_slug?: string | null
          server_group?: string | null
          show_on_reseller_page?: boolean
          ssl_days_remaining?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      store_products: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          expires_at: string
          id: string
          plan: Database["public"]["Enums"]["plan_type"]
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_digests: {
        Row: {
          had_news: boolean
          id: string
          kind: string
          period_end: string
          period_start: string
          sent_at: string
          summary: Json
          user_id: string
        }
        Insert: {
          had_news?: boolean
          id?: string
          kind: string
          period_end?: string
          period_start: string
          sent_at?: string
          summary?: Json
          user_id: string
        }
        Update: {
          had_news?: boolean
          id?: string
          kind?: string
          period_end?: string
          period_start?: string
          sent_at?: string
          summary?: Json
          user_id?: string
        }
        Relationships: []
      }
      tmdb_content_history: {
        Row: {
          discovery_server_id: string | null
          first_detected_at: string | null
          id: string
          last_detected_at: string | null
          media_type: string
          servers_found_count: number | null
          title_key: string
          tmdb_id: number | null
        }
        Insert: {
          discovery_server_id?: string | null
          first_detected_at?: string | null
          id?: string
          last_detected_at?: string | null
          media_type: string
          servers_found_count?: number | null
          title_key: string
          tmdb_id?: number | null
        }
        Update: {
          discovery_server_id?: string | null
          first_detected_at?: string | null
          id?: string
          last_detected_at?: string | null
          media_type?: string
          servers_found_count?: number | null
          title_key?: string
          tmdb_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tmdb_content_history_discovery_server_id_fkey"
            columns: ["discovery_server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      tmdb_follows: {
        Row: {
          created_at: string
          id: string
          media_type: string
          poster_path: string | null
          release_date: string | null
          title: string
          title_key: string
          tmdb_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: string
          poster_path?: string | null
          release_date?: string | null
          title: string
          title_key: string
          tmdb_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          poster_path?: string | null
          release_date?: string | null
          title?: string
          title_key?: string
          tmdb_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_code: string
          id: string
          server_id: string | null
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_code: string
          id?: string
          server_id?: string | null
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_code?: string
          id?: string
          server_id?: string | null
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_achievements_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_diagnostic_lock: {
        Args: { p_lock_key: string }
        Returns: boolean
      }
      acquire_diagnostic_slot_v2: {
        Args: {
          p_is_admin: boolean
          p_max_server_concurrent?: number
          p_server_id: string
          p_user_id: string
        }
        Returns: Json
      }
      activate_free_trial: { Args: never; Returns: Json }
      admin_add_credits: {
        Args: { _amount: number; _description?: string; _user_id: string }
        Returns: undefined
      }
      admin_approve_payout: { Args: { _id: string }; Returns: undefined }
      admin_grant_subscription: {
        Args: {
          _days: number
          _plan: Database["public"]["Enums"]["plan_type"]
          _user_id: string
        }
        Returns: Json
      }
      admin_list_payout_requests: {
        Args: never
        Returns: {
          admin_note: string
          amount_cents: number
          approved_at: string
          id: string
          paid_at: string
          pix_key: string
          pix_name: string
          pix_type: string
          referral_count: number
          rejected_at: string
          requested_at: string
          status: string
          user_email: string
          user_id: string
          user_name: string
          user_phone: string
        }[]
      }
      admin_mark_payout_paid: { Args: { _id: string }; Returns: undefined }
      admin_reject_payout: {
        Args: { _id: string; _note?: string }
        Returns: undefined
      }
      check_circuit_breaker: { Args: { p_server_id: string }; Returns: string }
      cleanup_diagnostic_slots: { Args: never; Returns: undefined }
      content_health_overview: { Args: { _server_id?: string }; Returns: Json }
      delete_server: { Args: { _id: string }; Returns: boolean }
      evaluate_achievements: { Args: { _user_id: string }; Returns: number }
      finalize_approved_payment: {
        Args: {
          _paid_at?: string
          _payment_id: string
          _provider_payment_id: string
          _raw_payload: Json
        }
        Returns: {
          applied: boolean
          expires_at: string
          plan: Database["public"]["Enums"]["plan_type"]
          user_id: string
        }[]
      }
      generate_referral_code: { Args: never; Returns: string }
      get_admin_paused_owners: {
        Args: never
        Returns: {
          account_type: string
          credits: number
          email: string
          expires_at: string
          full_name: string
          last_paused_at: string
          owner_id: string
          paused_reason: string
          paused_servers: number
          subscription_status: string
          total_servers: number
        }[]
      }
      get_admin_resellers: {
        Args: never
        Returns: {
          client_count: number
          created_at: string
          credits: number
          email: string
          full_name: string
          id: string
          last_activity_at: string
          phone: string
          sub_reseller_count: number
        }[]
      }
      get_admin_resellers_v2: {
        Args: never
        Returns: {
          client_count: number
          created_at: string
          credits: number
          email: string
          full_name: string
          id: string
          last_activity_at: string
          owner_id: string
          parent_id: string
          sub_reseller_count: number
        }[]
      }
      get_admin_stats: { Args: never; Returns: Json }
      get_admin_users: {
        Args: never
        Returns: {
          created_at: string
          days_remaining: number
          email: string
          expires_at: string
          full_name: string
          id: string
          is_admin: boolean
          last_payment_at: string
          phone: string
          plan: Database["public"]["Enums"]["plan_type"]
          status: Database["public"]["Enums"]["subscription_status"]
          total_paid_cents: number
        }[]
      }
      get_admin_users_v2: {
        Args: never
        Returns: {
          created_at: string
          credits: number
          days_remaining: number
          email: string
          expires_at: string
          full_name: string
          id: string
          is_admin: boolean
          is_reseller: boolean
          last_payment_at: string
          owner_id: string
          parent_id: string
          phone: string
          plan: Database["public"]["Enums"]["plan_type"]
          status: Database["public"]["Enums"]["subscription_status"]
          total_paid_cents: number
        }[]
      }
      get_catalog_update_ranking: {
        Args: { _limit?: number }
        Returns: {
          name: string
          total: number
          updates: number
        }[]
      }
      get_correlation_overview: { Args: { _server_id: string }; Returns: Json }
      get_iptv_radar_stats: { Args: never; Returns: Json }
      get_iptv_ranking: {
        Args: { _limit?: number }
        Returns: {
          api_ms: number
          categories: number
          channels: number
          health_score: number
          is_mine: boolean
          latency_ms: number
          movies: number
          name: string
          series: number
          server_id: string
          synced_at: string
        }[]
      }
      get_iptv_server_rank: { Args: { _server_id: string }; Returns: Json }
      get_my_parent_id: { Args: never; Returns: string }
      get_owner_account_id: { Args: { _user_id: string }; Returns: string }
      get_parent_reseller_pricing: {
        Args: { _reseller_id: string }
        Returns: {
          annual_price_cents: number
          monthly_price_cents: number
          quarterly_price_cents: number
          reseller_id: string
        }[]
      }
      get_public_checks: {
        Args: { _limit?: number; _slug: string }
        Returns: {
          checked_at: string
          latency_ms: number
          status: Database["public"]["Enums"]["server_status"]
        }[]
      }
      get_public_dns_list: {
        Args: never
        Returns: {
          current_status: Database["public"]["Enums"]["server_status"]
          last_checked_at: string
          name: string
        }[]
      }
      get_public_region_checks: {
        Args: { _limit?: number; _minutes?: number; _slug: string }
        Returns: {
          checked_at: string
          latency_ms: number
          region_code: string
          status: string
        }[]
      }
      get_public_status: {
        Args: { _slug: string }
        Returns: {
          current_status: Database["public"]["Enums"]["server_status"]
          description: string
          id: string
          last_checked_at: string
          last_latency_ms: number
          name: string
          ssl_days_remaining: number
        }[]
      }
      get_referral_summary: { Args: { _user_id: string }; Returns: Json }
      get_region_matrix: {
        Args: { _server_id: string; _window_minutes?: number }
        Returns: {
          checked_at: string
          city: string
          country: string
          details: Json
          error: string
          flag: string
          http_status: number
          latency_ms: number
          region_code: string
          region_name: string
          source: string
          status: string
        }[]
      }
      get_region_series: {
        Args: { _limit?: number; _minutes?: number; _server_id: string }
        Returns: {
          checked_at: string
          details: Json
          error: string
          http_status: number
          latency_ms: number
          region_code: string
          source: string
          status: string
        }[]
      }
      get_region_stats: {
        Args: { _minutes?: number; _server_id: string }
        Returns: {
          avg_ms: number
          downs: number
          max_ms: number
          min_ms: number
          p95_ms: number
          region_code: string
          total: number
          ups: number
        }[]
      }
      get_region_verdict: {
        Args: { _server_id: string; _window_minutes?: number }
        Returns: Json
      }
      get_reseller_page: { Args: { _slug: string }; Returns: Json }
      get_server_concurrency_limit: {
        Args: { p_base_limit: number; p_server_id: string }
        Returns: number
      }
      get_stability_ranking: {
        Args: { _limit?: number }
        Returns: {
          avg_latency_ms: number
          down_count: number
          instability_score: number
          max_latency_ms: number
          name: string
          total_checks: number
        }[]
      }
      get_storage_report: {
        Args: never
        Returns: {
          deletes: number
          index_pretty: string
          inserts: number
          rows: number
          table_name: string
          total_bytes: number
          total_pretty: string
          updates: number
        }[]
      }
      get_workers_health: {
        Args: never
        Returns: {
          checks_60s: number
          last_report_at: string
          region_code: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hub_get_ranking: {
        Args: { _limit?: number; _period_days?: number }
        Returns: {
          business_count: number
          handle: string
          premium: boolean
          rating_avg: number
          rating_count: number
          score: number
          user_id: string
          verified: boolean
        }[]
      }
      hub_profiles_moderation_unchanged: {
        Args: {
          _banned: boolean
          _id: string
          _verification_status: Database["public"]["Enums"]["hub_verification_status"]
          _verified_at: string
        }
        Returns: boolean
      }
      hub_recompute_rating: { Args: { _user: string }; Returns: undefined }
      hub_start_conversation: { Args: { _listing_id: string }; Returns: string }
      iptv_cluster_diagnostics: { Args: never; Returns: Json }
      iptv_find_title: {
        Args: { _kind?: string; _limit?: number; _query: string }
        Returns: {
          first_seen_at: string
          first_server: string
          kind: string
          mine_has: boolean
          server_count: number
          servers: Json
          title: string
          title_key: string
        }[]
      }
      iptv_first_detected: {
        Args: { _days?: number; _kind?: string; _limit?: number }
        Returns: {
          kind: string
          servers: Json
          title: string
          title_key: string
        }[]
      }
      iptv_novelties: { Args: { _hours?: number }; Returns: Json }
      iptv_recent_titles: {
        Args: {
          _kind?: string
          _limit?: number
          _offset?: number
          _order?: string
        }
        Returns: {
          first_seen_at: string
          first_server: string
          kind: string
          mine_has: boolean
          server_count: number
          title: string
          title_key: string
        }[]
      }
      iptv_server_comparison: {
        Args: { _limit?: number }
        Returns: {
          channels: number
          growth_7d: number
          health_score: number
          is_mine: boolean
          latency_ms: number
          movies: number
          name: string
          removed_7d: number
          series: number
          server_id: string
          synced_at: string
        }[]
      }
      iptv_title_servers: {
        Args: { _title_key: string }
        Returns: {
          is_mine: boolean
          seen_at: string
          server_name: string
        }[]
      }
      iptv_update_ranking: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          added_channels: number
          added_movies: number
          added_series: number
          added_total: number
          is_mine: boolean
          name: string
          server_id: string
        }[]
      }
      is_valid_referral_code: { Args: { _code: string }; Returns: boolean }
      listings_moderation_unchanged: {
        Args: { _flagged: boolean; _highlight: boolean; _id: string }
        Returns: boolean
      }
      mask_server_id: { Args: { _id: string; _owner: string }; Returns: string }
      mask_server_name: {
        Args: { _id: string; _name: string; _owner: string }
        Returns: string
      }
      process_credit_purchase: {
        Args: { p_credits: number; p_payment_id: string; p_user_id: string }
        Returns: undefined
      }
      profiles_privileged_unchanged: {
        Args: {
          _credits: number
          _id: string
          _is_reseller: boolean
          _owner_account_id: string
          _parent_id: string
          _signup_bonus_days: number
          _trial_used: boolean
        }
        Returns: boolean
      }
      prune_redundant_catalog_matches: { Args: never; Returns: number }
      purge_content_checks: { Args: { _days?: number }; Returns: number }
      purge_old_metrics: { Args: { _dry_run?: boolean }; Returns: Json }
      radar_title_availability: {
        Args: { _media: string; _title_keys: string[] }
        Returns: {
          aliases: number
          found_at: string
          is_mine: boolean
          last_sync_at: string
          name: string
          quality: string
          server_id: string
          status: string
        }[]
      }
      radar_title_count: {
        Args: { _media: string; _title_keys: string[] }
        Returns: number
      }
      rebuild_iptv_clusters: {
        Args: {
          _min_items?: number
          _min_overlap?: number
          _weak_overlap?: number
        }
        Returns: Json
      }
      rebuild_iptv_clusters_service: {
        Args: {
          _min_items?: number
          _min_overlap?: number
          _weak_overlap?: number
        }
        Returns: Json
      }
      recalc_iptv_availability: { Args: never; Returns: number }
      record_diagnostic_failure: {
        Args: { p_server_id: string }
        Returns: undefined
      }
      record_diagnostic_success: {
        Args: { p_server_id: string }
        Returns: undefined
      }
      region_consensus: {
        Args: { _server_id: string; _window_minutes?: number }
        Returns: Json
      }
      release_cron_lock: { Args: { _name: string }; Returns: undefined }
      release_diagnostic_lock: {
        Args: { p_lock_key: string }
        Returns: undefined
      }
      release_diagnostic_slot: {
        Args: { p_server_id: string; p_user_id: string }
        Returns: undefined
      }
      request_payout: {
        Args: { _pix_key: string; _pix_name: string; _pix_type: string }
        Returns: string
      }
      rollup_metrics: { Args: { _hours?: number }; Returns: Json }
      rollup_regional: { Args: { _hours?: number }; Returns: Json }
      run_radar_batch_sync: { Args: never; Returns: Json }
      subscription_is_active: { Args: { _user_id: string }; Returns: boolean }
      transfer_credits: {
        Args: { _amount: number; _recipient_id: string; _sender_id: string }
        Returns: undefined
      }
      transfer_credits_v2: {
        Args: { _amount: number; _recipient_id: string; _sender_id: string }
        Returns: undefined
      }
      try_acquire_cron_lock: {
        Args: { _holder?: string; _name: string; _ttl_seconds: number }
        Returns: boolean
      }
      update_catalog_stats: {
        Args: { _added_count: number; _server_id: string; _total: number }
        Returns: undefined
      }
    }
    Enums: {
      alert_kind: "email" | "discord" | "telegram" | "webhook"
      app_role: "admin" | "user" | "reseller" | "sub_reseller" | "customer"
      content_kind: "live" | "movie" | "series" | "episode"
      content_status:
        | "unknown"
        | "online"
        | "slow"
        | "unstable"
        | "offline"
        | "blocked"
        | "removed"
        | "suspect"
      hub_report_reason:
        | "spam"
        | "scam"
        | "contact_leak"
        | "offensive"
        | "other"
      hub_report_target: "listing" | "user" | "message"
      hub_verification_status: "none" | "pending" | "approved" | "rejected"
      iptv_kind: "none" | "xtream" | "m3u" | "both"
      iptv_mode: "basic" | "smart" | "full"
      iptv_stream_kind: "live" | "vod" | "series"
      listing_category:
        | "credits"
        | "panel"
        | "dedicated"
        | "vps"
        | "hosting"
        | "cdn"
        | "proxy"
        | "domain"
        | "cloudflare"
        | "service_setup"
        | "service_install"
        | "service_migration"
        | "service_dns"
        | "service_dev"
        | "service_bot"
        | "service_site"
        | "service_landing"
        | "service_app"
        | "partnership"
        | "help"
        | "other"
      listing_kind: "offer" | "demand"
      listing_status: "active" | "paused" | "closed" | "removed"
      payment_method: "pix" | "credit_card" | "boleto"
      payment_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "refunded"
      plan_type:
        | "trial"
        | "monthly"
        | "yearly"
        | "credits_10"
        | "credits_30"
        | "credits_50"
        | "credits_40"
        | "reseller"
        | "basic"
        | "quarterly"
        | "semiannual"
      server_status: "up" | "degraded" | "down" | "unknown"
      subscription_status: "trial" | "active" | "expired" | "cancelled"
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
    Enums: {
      alert_kind: ["email", "discord", "telegram", "webhook"],
      app_role: ["admin", "user", "reseller", "sub_reseller", "customer"],
      content_kind: ["live", "movie", "series", "episode"],
      content_status: [
        "unknown",
        "online",
        "slow",
        "unstable",
        "offline",
        "blocked",
        "removed",
        "suspect",
      ],
      hub_report_reason: ["spam", "scam", "contact_leak", "offensive", "other"],
      hub_report_target: ["listing", "user", "message"],
      hub_verification_status: ["none", "pending", "approved", "rejected"],
      iptv_kind: ["none", "xtream", "m3u", "both"],
      iptv_mode: ["basic", "smart", "full"],
      iptv_stream_kind: ["live", "vod", "series"],
      listing_category: [
        "credits",
        "panel",
        "dedicated",
        "vps",
        "hosting",
        "cdn",
        "proxy",
        "domain",
        "cloudflare",
        "service_setup",
        "service_install",
        "service_migration",
        "service_dns",
        "service_dev",
        "service_bot",
        "service_site",
        "service_landing",
        "service_app",
        "partnership",
        "help",
        "other",
      ],
      listing_kind: ["offer", "demand"],
      listing_status: ["active", "paused", "closed", "removed"],
      payment_method: ["pix", "credit_card", "boleto"],
      payment_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "refunded",
      ],
      plan_type: [
        "trial",
        "monthly",
        "yearly",
        "credits_10",
        "credits_30",
        "credits_50",
        "credits_40",
        "reseller",
        "basic",
        "quarterly",
        "semiannual",
      ],
      server_status: ["up", "degraded", "down", "unknown"],
      subscription_status: ["trial", "active", "expired", "cancelled"],
    },
  },
} as const
