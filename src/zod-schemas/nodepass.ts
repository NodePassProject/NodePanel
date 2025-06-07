
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["出口(s)", "入口(c)"], {
    required_error: "实例类型是必需的。",
  }),
  autoCreateServer: z.optional(z.boolean()),
  serverApiId: z.optional(z.string()),
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().optional(),
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "event"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(),
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).superRefine((data, ctx) => {
  // TargetAddress validation
  if (data.instanceType === "出口(s)" && (!data.targetAddress || data.targetAddress.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "目标地址 (业务数据) 是必需的。",
      path: ["targetAddress"],
    });
  } else if (data.instanceType === "出口(s)" && data.targetAddress && !/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "目标地址 (业务数据) 格式无效 (例: host:port)",
      path: ["targetAddress"],
    });
  }


  if (data.instanceType === "入口(c)" && data.autoCreateServer) {
    if (!data.targetAddress || data.targetAddress.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自动创建出口(s)时，其转发目标地址是必需的。",
        path: ["targetAddress"],
      });
    } else if (data.targetAddress && !/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
       ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "出口(s)转发目标地址格式无效 (例: host:port)",
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
  }
});


// Type for the create form values
export type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

// modifyInstanceFormSchema and ModifyInstanceFormValues removed

// This schema is for the API request, which still expects a single URL for creating
export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});

// modifyInstanceConfigApiSchema removed

export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});
