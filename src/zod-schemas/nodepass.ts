
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["server", "client"], {
    required_error: "实例类型是必需的。",
  }),
  autoCreateServer: z.optional(z.boolean()),
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().optional(), // Made optional here, validated in superRefine
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "fatal"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(), 
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).superRefine((data, ctx) => {
  // TargetAddress validation
  if (data.instanceType === "server" && (!data.targetAddress || data.targetAddress.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "目标地址是必需的。",
      path: ["targetAddress"],
    });
  } else if (data.instanceType === "server" && data.targetAddress && !/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "目标地址格式无效 (例: host:port 或 [ipv6]:port)",
      path: ["targetAddress"],
    });
  }


  if (data.instanceType === "client" && data.autoCreateServer) {
    if (!data.targetAddress || data.targetAddress.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自动创建服务端时，服务端转发目标地址是必需的。",
        path: ["targetAddress"],
      });
    } else if (data.targetAddress && !/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
       ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "服务端转发目标地址格式无效 (例: host:port 或 [ipv6]:port)",
        path: ["targetAddress"],
      });
    }
  }


  // TLS Mode and Cert/Key Path validation
  const effectiveTlsUser = data.instanceType === 'client' && data.autoCreateServer ? 'server' : data.instanceType;

  if (effectiveTlsUser === "server") {
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
  } else if (effectiveTlsUser === "client") { // This case implies client AND !autoCreateServer
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) { 
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "客户端TLS模式无效。",
        path: ["tlsMode"],
      });
    }
    // For a pure client, certPath and keyPath are not typically sent in its URL.
    // If tlsMode '2' is selected for a pure client, it's informational for connection behavior,
    // but the paths themselves aren't part of its own instance URL.
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
