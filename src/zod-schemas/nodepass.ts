import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["Client", "Server"], {
    required_error: "Instance type is required.",
  }),
  alias: z.string().trim().max(50, "Alias can be at most 50 characters").optional(),
  tunnelKey: z.string().trim().max(100, "Tunnel key can be at most 100 characters").optional(),
  isSingleEndedForward: z.optional(z.boolean()),
  tunnelAddress: z.string().min(1, "This field is required."),
  targetAddress: z.optional(z.string()),
  logLevel: z.enum(["master", "debug", "info", "warn", "error"], {
    required_error: "Log level is required.",
  }),
  tlsMode: z.string(),
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
  minPoolSize: z.number().int().positive().optional(),
  maxPoolSize: z.number().int().positive().optional(),
}).superRefine((data, ctx) => {
  if (data.instanceType === "Client") {
    if (data.isSingleEndedForward) {
      if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid listen address format (e.g., 127.0.0.1:8080 or [::]:8080)",
          path: ["tunnelAddress"],
        });
      }
      if (!data.targetAddress || data.targetAddress.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Forward address (remote target) is required.",
          path: ["targetAddress"],
        });
      } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Forward address (remote target) format is invalid (e.g., host:port)",
          path: ["targetAddress"],
        });
      }
    } else {
      if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid server tunnel connection address format (e.g., host:port or [ipv6]:port)",
          path: ["tunnelAddress"],
        });
      }
      if (data.targetAddress && data.targetAddress.trim() !== "" && !/^[0-9]+$/.test(data.targetAddress.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid client local forward port format (should be a number).",
          path: ["targetAddress"],
        });
      }
    }
    if (data.minPoolSize && data.maxPoolSize && data.minPoolSize >= data.maxPoolSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum connection count must be less than maximum connection count.",
        path: ["minPoolSize"],
      });
    }
  } else if (data.instanceType === "Server") {
    if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid server tunnel listen address format (e.g., host:port or [ipv6]:port)",
        path: ["tunnelAddress"],
      });
    }
    if (!data.targetAddress || data.targetAddress.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Forward address (server) is required.",
        path: ["targetAddress"],
      });
    } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Forward address (server) format is invalid (e.g., host:port)",
        path: ["targetAddress"],
      });
    }
  }

  if (!(data.instanceType === "Client" && data.isSingleEndedForward)) {
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.instanceType} TLS mode is invalid.`,
        path: ["tlsMode"],
      });
    }
    if (data.tlsMode === "2") {
      if (!data.certPath || data.certPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS mode '2' requires a certificate path.", path: ["certPath"] });
      }
      if (!data.keyPath || data.keyPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS mode '2' requires a key path.", path: ["keyPath"] });
      }
    }
  }
});


export type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL is required.").url("Invalid URL format. E.g., scheme://host:port/host:port"),
});

export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});