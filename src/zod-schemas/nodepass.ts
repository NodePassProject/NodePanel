
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["入口(c)", "出口(s)"], { // Updated terminology
    required_error: "实例类型是必需的。",
  }),
  autoCreateServer: z.optional(z.boolean()),
  serverApiId: z.optional(z.string()), // ID of the master where the server instance will be created if autoCreateServer is true
  tunnelAddress: z.string().min(1, "隧道地址/端口是必需的。"), // Meaning changes based on context
  targetAddress: z.string().optional(), // For "入口(c)" this is local forward port (optional), for "出口(s)" this is required host:port
  serverTargetAddressForAutoCreate: z.optional(z.string()), // Specific for auto-created server's target
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "event"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(), // Will be validated to 'master', '0', '1', '2'
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).superRefine((data, ctx) => {
  // TunnelAddress validation
  if (data.instanceType === "入口(c)" && data.autoCreateServer) {
    // In this mode, tunnelAddress is just the PORT for the auto-created server
    if (!/^[0-9]+$/.test(data.tunnelAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自动创建的出口(s)监听端口格式无效 (例: 10101)",
        path: ["tunnelAddress"],
      });
    }
    // serverTargetAddressForAutoCreate is REQUIRED in this mode
    if (!data.serverTargetAddressForAutoCreate || data.serverTargetAddressForAutoCreate.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自动创建的出口(s)目标地址 (业务数据) 是必需的。",
        path: ["serverTargetAddressForAutoCreate"],
      });
    } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.serverTargetAddressForAutoCreate)) {
       ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自动创建的出口(s)目标地址 (业务数据) 格式无效 (例: host:port)",
        path: ["serverTargetAddressForAutoCreate"],
      });
    }
  } else { // For "出口(s)" type, or "入口(c)" type without autoCreateServer
    // tunnelAddress must be host:port
    if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "隧道地址格式无效 (例: host:port 或 [ipv6]:port)",
        path: ["tunnelAddress"],
      });
    }
  }

  // TargetAddress validation
  if (data.instanceType === "出口(s)") {
    if (!data.targetAddress || data.targetAddress.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "出口(s)目标地址 (业务数据) 是必需的。",
        path: ["targetAddress"],
      });
    } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "出口(s)目标地址 (业务数据) 格式无效 (例: host:port)",
        path: ["targetAddress"],
      });
    }
  } else if (data.instanceType === "入口(c)") {
    // For "入口(c)", targetAddress is the local forward PORT (optional).
    if (data.targetAddress && data.targetAddress.trim() !== "" && !/^[0-9]+$/.test(data.targetAddress.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "入口(c)本地转发端口格式无效 (应为数字)。",
        path: ["targetAddress"],
      });
    }
  }


  // TLS Mode and Cert/Key Path validation
  const effectiveTlsUserType = data.instanceType === '入口(c)' && data.autoCreateServer ? '出口(s)' : data.instanceType;

  if (effectiveTlsUserType === "出口(s)") {
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "出口(s) TLS模式无效。",
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
  } else if (effectiveTlsUserType === "入口(c)") {
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "入口(c) TLS模式无效。",
        path: ["tlsMode"],
      });
    }
     if (data.tlsMode === "2") { // Client can also have certs for mTLS with server, though less common to configure here
      if (!data.certPath || data.certPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要证书路径 (入口(c))。", path: ["certPath"] });
      }
      if (!data.keyPath || data.keyPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要密钥路径 (入口(c))。", path: ["keyPath"] });
      }
    }
  }
});


// Type for the create form values
export type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

// This schema is for the API request, which still expects a single URL for creating
export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});

export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});
