
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["server", "client"], {
    required_error: "实例类型是必需的。",
  }),
  autoCreateServer: z.optional(z.boolean()), // Moved up for earlier access in superRefine
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().min(1, "目标地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "目标地址格式无效 (例: host:port 或 [ipv6]:port)"),
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "fatal"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(), 
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).superRefine((data, ctx) => {
  if (data.instanceType === "server") {
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "服务端TLS模式无效。",
        path: ["tlsMode"],
      });
    }
    if (data.tlsMode === "2") {
      if (!data.certPath || data.certPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要证书路径。", path: ["certPath"] });
      }
      if (!data.keyPath || data.keyPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要密钥路径。", path: ["keyPath"] });
      }
    }
  } else if (data.instanceType === "client") {
    // If autoCreateServer is true, client's tlsMode is for the server, so it can be "master", "0", "1", "2".
    // If autoCreateServer is false, client's tlsMode is for its own connection, typically "0" or "1".
    // For simplicity in the form, we allow all. The buildUrl logic will handle client-specific URL construction.
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "客户端选择的TLS模式无效。", // Generic message, as its use depends on autoCreateServer
        path: ["tlsMode"],
      });
    }
    // CertPath and KeyPath are not directly used by the client instance itself.
    // If autoCreateServer is true and tlsMode is "2", these would apply to the server.
    // The form doesn't show these inputs for client type, so they'd be empty if submitted.
    // This is acceptable; backend or master defaults would handle it for the auto-created server.
  }
});


// Type for the create form values
export type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

// Schema for the detailed modify instance form - Defined independently
export const modifyInstanceFormSchema = z.object({
  instanceType: z.enum(["server", "client"], { 
    required_error: "实例类型是必需的。",
  }),
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().min(1, "目标地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "目标地址格式无效 (例: host:port 或 [ipv6]:port)"),
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "fatal"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(), // Similar to create, validated by superRefine based on instanceType
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).superRefine((data, ctx) => {
  if (data.instanceType === "server") {
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "服务端TLS模式无效。",
        path: ["tlsMode"],
      });
    }
    if (data.tlsMode === "2") {
      if (!data.certPath || data.certPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要证书路径。", path: ["certPath"] });
      }
      if (!data.keyPath || data.keyPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要密钥路径。", path: ["keyPath"] });
      }
    }
  } else if (data.instanceType === "client") {
     // For modify, client tlsMode doesn't directly configure the client instance's own connection in the URL usually.
     // It's more of a reference or for potential future use if clients start supporting such URL params.
     // Allowing all for now to match server, but typical direct client usage would be 0 or 1 for connection behavior.
     if (!["master", "0", "1", "2"].includes(data.tlsMode)) { 
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "客户端TLS模式无效。",
        path: ["tlsMode"],
      });
    }
  }
});


// Type for the modify form values
export type ModifyInstanceFormValues = z.infer<typeof modifyInstanceFormSchema>;


// This schema is for the API request, which still expects a single URL for creating
export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});

// This schema is for the API request for modifying configuration, expecting a single URL
export const modifyInstanceConfigApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});


export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});
