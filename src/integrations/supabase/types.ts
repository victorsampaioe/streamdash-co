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
          ended_at: string | null
          id: string
          notified: boolean
          reason: string | null
          server_id: string
          started_at: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          notified?: boolean
          reason?: string | null
          server_id: string
          started_at?: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          notified?: boolean
          reason?: string | null
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
          pix_copy_paste: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          plan: Database["public"]["Enums"]["plan_type"]
          provider: string
          provider_payment_id: string | null
          raw_payload: Json | null
          status: Database["public"]["Enums"]["payment_status"]
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
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          plan: Database["public"]["Enums"]["plan_type"]
          provider?: string
          provider_payment_id?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
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
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          plan?: Database["public"]["Enums"]["plan_type"]
          provider?: string
          provider_payment_id?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          signup_bonus_days: number
          trial_used: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          signup_bonus_days?: number
          trial_used?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          signup_bonus_days?: number
          trial_used?: boolean
        }
        Relationships: []
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
      region_checks: {
        Row: {
          checked_at: string
          error: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          region_code: string
          server_id: string
          status: string
        }
        Insert: {
          checked_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          region_code: string
          server_id: string
          status: string
        }
        Update: {
          checked_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          region_code?: string
          server_id?: string
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
          name: string
          owner_id: string
          public_slug: string | null
          ssl_days_remaining: number | null
          updated_at: string
        }
        Insert: {
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
          name: string
          owner_id: string
          public_slug?: string | null
          ssl_days_remaining?: number | null
          updated_at?: string
        }
        Update: {
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
          name?: string
          owner_id?: string
          public_slug?: string | null
          ssl_days_remaining?: number | null
          updated_at?: string
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
      activate_free_trial: { Args: never; Returns: Json }
      admin_approve_payout: { Args: { _id: string }; Returns: undefined }
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
      hub_recompute_rating: { Args: { _user: string }; Returns: undefined }
      hub_start_conversation: { Args: { _listing_id: string }; Returns: string }
      is_valid_referral_code: { Args: { _code: string }; Returns: boolean }
      request_payout: {
        Args: { _pix_key: string; _pix_name: string; _pix_type: string }
        Returns: string
      }
      subscription_is_active: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      alert_kind: "email" | "discord" | "telegram" | "webhook"
      app_role: "admin" | "user"
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
      plan_type: "trial" | "monthly" | "yearly"
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
      app_role: ["admin", "user"],
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
      plan_type: ["trial", "monthly", "yearly"],
      server_status: ["up", "degraded", "down", "unknown"],
      subscription_status: ["trial", "active", "expired", "cancelled"],
    },
  },
} as const
