export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "customer" | "merchant";
          full_name: string;
          phone: string | null;
          status: "active" | "pending" | "blocked";
          store_name: string | null;
          alias: string | null;
          cvu: string | null;
          wallet_provider: string | null;
          wallet_holder: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: "customer" | "merchant";
          full_name: string;
          phone?: string | null;
          status?: "active" | "pending" | "blocked";
          store_name?: string | null;
          alias?: string | null;
          cvu?: string | null;
          wallet_provider?: string | null;
          wallet_holder?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: "customer" | "merchant";
          full_name?: string;
          phone?: string | null;
          status?: "active" | "pending" | "blocked";
          store_name?: string | null;
          alias?: string | null;
          cvu?: string | null;
          wallet_provider?: string | null;
          wallet_holder?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      credit_lines: {
        Row: {
          id: string;
          merchant_id: string;
          customer_id: string;
          credit_limit: number;
          current_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          customer_id: string;
          credit_limit?: number;
          current_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          merchant_id?: string;
          customer_id?: string;
          credit_limit?: number;
          current_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      qr_intents: {
        Row: {
          id: string;
          merchant_id: string;
          customer_id: string;
          amount: number;
          description: string;
          status: "pending" | "approved" | "expired" | "cancelled";
          expires_at: string;
          created_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          customer_id: string;
          amount: number;
          description?: string;
          status?: "pending" | "approved" | "expired" | "cancelled";
          expires_at?: string;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          merchant_id?: string;
          customer_id?: string;
          amount?: number;
          description?: string;
          status?: "pending" | "approved" | "expired" | "cancelled";
          expires_at?: string;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          merchant_id: string;
          customer_id: string;
          credit_line_id: string;
          qr_intent_id: string | null;
          type: "purchase" | "payment_notice" | "payment";
          status: "pending" | "confirmed" | "rejected" | "expired";
          amount: number;
          description: string;
          source_wallet: string | null;
          source_holder: string | null;
          operation_reference: string | null;
          receipt_path: string | null;
          review_deadline: string | null;
          rejection_reason: string | null;
          created_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          customer_id: string;
          credit_line_id: string;
          qr_intent_id?: string | null;
          type: "purchase" | "payment_notice" | "payment";
          status?: "pending" | "confirmed" | "rejected" | "expired";
          amount: number;
          description: string;
          source_wallet?: string | null;
          source_holder?: string | null;
          operation_reference?: string | null;
          receipt_path?: string | null;
          review_deadline?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          merchant_id?: string;
          customer_id?: string;
          credit_line_id?: string;
          qr_intent_id?: string | null;
          type?: "purchase" | "payment_notice" | "payment";
          status?: "pending" | "confirmed" | "rejected" | "expired";
          amount?: number;
          description?: string;
          source_wallet?: string | null;
          source_holder?: string | null;
          operation_reference?: string | null;
          receipt_path?: string | null;
          review_deadline?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      approve_qr_intent: {
        Args: { p_intent_id: string };
        Returns: string;
      };
      confirm_payment_received: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      reject_payment_received: {
        Args: { p_transaction_id: string; p_reason: string };
        Returns: undefined;
      };
      create_qr_intent: {
        Args: { p_customer_id: string; p_amount: number; p_description?: string };
        Returns: string;
      };
      notify_payment: {
        Args: {
          p_credit_line_id: string;
          p_amount: number | null;
          p_receipt_path: string;
          p_operation_reference: string | null;
        };
        Returns: string;
      };
      update_payment_profile: {
        Args: { p_wallet_provider: string; p_wallet_holder: string };
        Returns: undefined;
      };
      set_credit_limit: {
        Args: { p_credit_line_id: string; p_new_limit: number };
        Returns: undefined;
      };
      link_customer: {
        Args: { p_customer_email: string; p_credit_limit?: number };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
