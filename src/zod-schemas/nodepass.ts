
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["server", "client"], {
    required_error: "实例类型是必需的。",
  }),
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().min(1, "目标地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "目标地址格式无效 (例: host:port 或 [ipv6]:port)"),
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "fatal"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(), // Server can be "master", "0", "1", "2". Client can be "0", "1". Validated by superRefine.
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
  autoCreateServer: z.optional(z.boolean()),
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
    if (!["0", "1"].includes(data.tlsMode)) { // Client MUST pick 0 or 1.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "客户端TLS模式必须为 '0' (无TLS) 或 '1' (TLS)。",
        path: ["tlsMode"],
      });
    }
    // For client, certPath and keyPath are not applicable and should not be submitted.
    // The form UI should hide these. If they are somehow submitted, it might indicate an issue,
    // but the backend will likely ignore them for client types.
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
     if (!["0", "1"].includes(data.tlsMode)) { 
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "客户端TLS模式必须为 '0' (无TLS) 或 '1' (TLS)。",
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
