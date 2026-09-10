import { debugLogWithPrefix } from "./debugLog-LfbHS9a2.js";
import { ZodFirstPartyTypeKind, ZodObject, ZodType, z } from "zod";
import { Transform } from "stream";
import process$1 from "node:process";

//#region node_modules/.pnpm/@modelcontextprotocol+sdk@1.12.1/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js
const LATEST_PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_PROTOCOL_VERSIONS = [
	LATEST_PROTOCOL_VERSION,
	"2024-11-05",
	"2024-10-07"
];
const JSONRPC_VERSION = "2.0";
/**
* A progress token, used to associate progress notifications with the original request.
*/
const ProgressTokenSchema = z.union([z.string(), z.number().int()]);
/**
* An opaque token used to represent a cursor for pagination.
*/
const CursorSchema = z.string();
const RequestMetaSchema = z.object({ progressToken: z.optional(ProgressTokenSchema) }).passthrough();
const BaseRequestParamsSchema = z.object({ _meta: z.optional(RequestMetaSchema) }).passthrough();
const RequestSchema = z.object({
	method: z.string(),
	params: z.optional(BaseRequestParamsSchema)
});
const BaseNotificationParamsSchema = z.object({ _meta: z.optional(z.object({}).passthrough()) }).passthrough();
const NotificationSchema = z.object({
	method: z.string(),
	params: z.optional(BaseNotificationParamsSchema)
});
const ResultSchema = z.object({ _meta: z.optional(z.object({}).passthrough()) }).passthrough();
/**
* A uniquely identifying ID for a request in JSON-RPC.
*/
const RequestIdSchema = z.union([z.string(), z.number().int()]);
/**
* A request that expects a response.
*/
const JSONRPCRequestSchema = z.object({
	jsonrpc: z.literal(JSONRPC_VERSION),
	id: RequestIdSchema
}).merge(RequestSchema).strict();
const isJSONRPCRequest = (value) => JSONRPCRequestSchema.safeParse(value).success;
/**
* A notification which does not expect a response.
*/
const JSONRPCNotificationSchema = z.object({ jsonrpc: z.literal(JSONRPC_VERSION) }).merge(NotificationSchema).strict();
const isJSONRPCNotification = (value) => JSONRPCNotificationSchema.safeParse(value).success;
/**
* A successful (non-error) response to a request.
*/
const JSONRPCResponseSchema = z.object({
	jsonrpc: z.literal(JSONRPC_VERSION),
	id: RequestIdSchema,
	result: ResultSchema
}).strict();
const isJSONRPCResponse = (value) => JSONRPCResponseSchema.safeParse(value).success;
/**
* Error codes defined by the JSON-RPC specification.
*/
var ErrorCode;
(function(ErrorCode$1) {
	ErrorCode$1[ErrorCode$1["ConnectionClosed"] = -32e3] = "ConnectionClosed";
	ErrorCode$1[ErrorCode$1["RequestTimeout"] = -32001] = "RequestTimeout";
	ErrorCode$1[ErrorCode$1["ParseError"] = -32700] = "ParseError";
	ErrorCode$1[ErrorCode$1["InvalidRequest"] = -32600] = "InvalidRequest";
	ErrorCode$1[ErrorCode$1["MethodNotFound"] = -32601] = "MethodNotFound";
	ErrorCode$1[ErrorCode$1["InvalidParams"] = -32602] = "InvalidParams";
	ErrorCode$1[ErrorCode$1["InternalError"] = -32603] = "InternalError";
})(ErrorCode || (ErrorCode = {}));
/**
* A response to a request that indicates an error occurred.
*/
const JSONRPCErrorSchema = z.object({
	jsonrpc: z.literal(JSONRPC_VERSION),
	id: RequestIdSchema,
	error: z.object({
		code: z.number().int(),
		message: z.string(),
		data: z.optional(z.unknown())
	})
}).strict();
const isJSONRPCError = (value) => JSONRPCErrorSchema.safeParse(value).success;
const JSONRPCMessageSchema = z.union([
	JSONRPCRequestSchema,
	JSONRPCNotificationSchema,
	JSONRPCResponseSchema,
	JSONRPCErrorSchema
]);
/**
* A response that indicates success but carries no data.
*/
const EmptyResultSchema = ResultSchema.strict();
/**
* This notification can be sent by either side to indicate that it is cancelling a previously-issued request.
*
* The request SHOULD still be in-flight, but due to communication latency, it is always possible that this notification MAY arrive after the request has already finished.
*
* This notification indicates that the result will be unused, so any associated processing SHOULD cease.
*
* A client MUST NOT attempt to cancel its `initialize` request.
*/
const CancelledNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/cancelled"),
	params: BaseNotificationParamsSchema.extend({
		requestId: RequestIdSchema,
		reason: z.string().optional()
	})
});
/**
* Describes the name and version of an MCP implementation.
*/
const ImplementationSchema = z.object({
	name: z.string(),
	version: z.string()
}).passthrough();
/**
* Capabilities a client may support. Known capabilities are defined here, in this schema, but this is not a closed set: any client can define its own, additional capabilities.
*/
const ClientCapabilitiesSchema = z.object({
	experimental: z.optional(z.object({}).passthrough()),
	sampling: z.optional(z.object({}).passthrough()),
	roots: z.optional(z.object({ listChanged: z.optional(z.boolean()) }).passthrough())
}).passthrough();
/**
* This request is sent from the client to the server when it first connects, asking it to begin initialization.
*/
const InitializeRequestSchema = RequestSchema.extend({
	method: z.literal("initialize"),
	params: BaseRequestParamsSchema.extend({
		protocolVersion: z.string(),
		capabilities: ClientCapabilitiesSchema,
		clientInfo: ImplementationSchema
	})
});
/**
* Capabilities that a server may support. Known capabilities are defined here, in this schema, but this is not a closed set: any server can define its own, additional capabilities.
*/
const ServerCapabilitiesSchema = z.object({
	experimental: z.optional(z.object({}).passthrough()),
	logging: z.optional(z.object({}).passthrough()),
	completions: z.optional(z.object({}).passthrough()),
	prompts: z.optional(z.object({ listChanged: z.optional(z.boolean()) }).passthrough()),
	resources: z.optional(z.object({
		subscribe: z.optional(z.boolean()),
		listChanged: z.optional(z.boolean())
	}).passthrough()),
	tools: z.optional(z.object({ listChanged: z.optional(z.boolean()) }).passthrough())
}).passthrough();
/**
* After receiving an initialize request from the client, the server sends this response.
*/
const InitializeResultSchema = ResultSchema.extend({
	protocolVersion: z.string(),
	capabilities: ServerCapabilitiesSchema,
	serverInfo: ImplementationSchema,
	instructions: z.optional(z.string())
});
/**
* This notification is sent from the client to the server after initialization has finished.
*/
const InitializedNotificationSchema = NotificationSchema.extend({ method: z.literal("notifications/initialized") });
/**
* A ping, issued by either the server or the client, to check that the other party is still alive. The receiver must promptly respond, or else may be disconnected.
*/
const PingRequestSchema = RequestSchema.extend({ method: z.literal("ping") });
const ProgressSchema = z.object({
	progress: z.number(),
	total: z.optional(z.number()),
	message: z.optional(z.string())
}).passthrough();
/**
* An out-of-band notification used to inform the receiver of a progress update for a long-running request.
*/
const ProgressNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/progress"),
	params: BaseNotificationParamsSchema.merge(ProgressSchema).extend({ progressToken: ProgressTokenSchema })
});
const PaginatedRequestSchema = RequestSchema.extend({ params: BaseRequestParamsSchema.extend({ cursor: z.optional(CursorSchema) }).optional() });
const PaginatedResultSchema = ResultSchema.extend({ nextCursor: z.optional(CursorSchema) });
/**
* The contents of a specific resource or sub-resource.
*/
const ResourceContentsSchema = z.object({
	uri: z.string(),
	mimeType: z.optional(z.string())
}).passthrough();
const TextResourceContentsSchema = ResourceContentsSchema.extend({ text: z.string() });
const BlobResourceContentsSchema = ResourceContentsSchema.extend({ blob: z.string().base64() });
/**
* A known resource that the server is capable of reading.
*/
const ResourceSchema = z.object({
	uri: z.string(),
	name: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string())
}).passthrough();
/**
* A template description for resources available on the server.
*/
const ResourceTemplateSchema = z.object({
	uriTemplate: z.string(),
	name: z.string(),
	description: z.optional(z.string()),
	mimeType: z.optional(z.string())
}).passthrough();
/**
* Sent from the client to request a list of resources the server has.
*/
const ListResourcesRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("resources/list") });
/**
* The server's response to a resources/list request from the client.
*/
const ListResourcesResultSchema = PaginatedResultSchema.extend({ resources: z.array(ResourceSchema) });
/**
* Sent from the client to request a list of resource templates the server has.
*/
const ListResourceTemplatesRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("resources/templates/list") });
/**
* The server's response to a resources/templates/list request from the client.
*/
const ListResourceTemplatesResultSchema = PaginatedResultSchema.extend({ resourceTemplates: z.array(ResourceTemplateSchema) });
/**
* Sent from the client to the server, to read a specific resource URI.
*/
const ReadResourceRequestSchema = RequestSchema.extend({
	method: z.literal("resources/read"),
	params: BaseRequestParamsSchema.extend({ uri: z.string() })
});
/**
* The server's response to a resources/read request from the client.
*/
const ReadResourceResultSchema = ResultSchema.extend({ contents: z.array(z.union([TextResourceContentsSchema, BlobResourceContentsSchema])) });
/**
* An optional notification from the server to the client, informing it that the list of resources it can read from has changed. This may be issued by servers without any previous subscription from the client.
*/
const ResourceListChangedNotificationSchema = NotificationSchema.extend({ method: z.literal("notifications/resources/list_changed") });
/**
* Sent from the client to request resources/updated notifications from the server whenever a particular resource changes.
*/
const SubscribeRequestSchema = RequestSchema.extend({
	method: z.literal("resources/subscribe"),
	params: BaseRequestParamsSchema.extend({ uri: z.string() })
});
/**
* Sent from the client to request cancellation of resources/updated notifications from the server. This should follow a previous resources/subscribe request.
*/
const UnsubscribeRequestSchema = RequestSchema.extend({
	method: z.literal("resources/unsubscribe"),
	params: BaseRequestParamsSchema.extend({ uri: z.string() })
});
/**
* A notification from the server to the client, informing it that a resource has changed and may need to be read again. This should only be sent if the client previously sent a resources/subscribe request.
*/
const ResourceUpdatedNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/resources/updated"),
	params: BaseNotificationParamsSchema.extend({ uri: z.string() })
});
/**
* Describes an argument that a prompt can accept.
*/
const PromptArgumentSchema = z.object({
	name: z.string(),
	description: z.optional(z.string()),
	required: z.optional(z.boolean())
}).passthrough();
/**
* A prompt or prompt template that the server offers.
*/
const PromptSchema = z.object({
	name: z.string(),
	description: z.optional(z.string()),
	arguments: z.optional(z.array(PromptArgumentSchema))
}).passthrough();
/**
* Sent from the client to request a list of prompts and prompt templates the server has.
*/
const ListPromptsRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("prompts/list") });
/**
* The server's response to a prompts/list request from the client.
*/
const ListPromptsResultSchema = PaginatedResultSchema.extend({ prompts: z.array(PromptSchema) });
/**
* Used by the client to get a prompt provided by the server.
*/
const GetPromptRequestSchema = RequestSchema.extend({
	method: z.literal("prompts/get"),
	params: BaseRequestParamsSchema.extend({
		name: z.string(),
		arguments: z.optional(z.record(z.string()))
	})
});
/**
* Text provided to or from an LLM.
*/
const TextContentSchema = z.object({
	type: z.literal("text"),
	text: z.string()
}).passthrough();
/**
* An image provided to or from an LLM.
*/
const ImageContentSchema = z.object({
	type: z.literal("image"),
	data: z.string().base64(),
	mimeType: z.string()
}).passthrough();
/**
* An Audio provided to or from an LLM.
*/
const AudioContentSchema = z.object({
	type: z.literal("audio"),
	data: z.string().base64(),
	mimeType: z.string()
}).passthrough();
/**
* The contents of a resource, embedded into a prompt or tool call result.
*/
const EmbeddedResourceSchema = z.object({
	type: z.literal("resource"),
	resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema])
}).passthrough();
/**
* Describes a message returned as part of a prompt.
*/
const PromptMessageSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.union([
		TextContentSchema,
		ImageContentSchema,
		AudioContentSchema,
		EmbeddedResourceSchema
	])
}).passthrough();
/**
* The server's response to a prompts/get request from the client.
*/
const GetPromptResultSchema = ResultSchema.extend({
	description: z.optional(z.string()),
	messages: z.array(PromptMessageSchema)
});
/**
* An optional notification from the server to the client, informing it that the list of prompts it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
const PromptListChangedNotificationSchema = NotificationSchema.extend({ method: z.literal("notifications/prompts/list_changed") });
/**
* Additional properties describing a Tool to clients.
*
* NOTE: all properties in ToolAnnotations are **hints**.
* They are not guaranteed to provide a faithful description of
* tool behavior (including descriptive properties like `title`).
*
* Clients should never make tool use decisions based on ToolAnnotations
* received from untrusted servers.
*/
const ToolAnnotationsSchema = z.object({
	title: z.optional(z.string()),
	readOnlyHint: z.optional(z.boolean()),
	destructiveHint: z.optional(z.boolean()),
	idempotentHint: z.optional(z.boolean()),
	openWorldHint: z.optional(z.boolean())
}).passthrough();
/**
* Definition for a tool the client can call.
*/
const ToolSchema = z.object({
	name: z.string(),
	description: z.optional(z.string()),
	inputSchema: z.object({
		type: z.literal("object"),
		properties: z.optional(z.object({}).passthrough()),
		required: z.optional(z.array(z.string()))
	}).passthrough(),
	outputSchema: z.optional(z.object({
		type: z.literal("object"),
		properties: z.optional(z.object({}).passthrough()),
		required: z.optional(z.array(z.string()))
	}).passthrough()),
	annotations: z.optional(ToolAnnotationsSchema)
}).passthrough();
/**
* Sent from the client to request a list of tools the server has.
*/
const ListToolsRequestSchema = PaginatedRequestSchema.extend({ method: z.literal("tools/list") });
/**
* The server's response to a tools/list request from the client.
*/
const ListToolsResultSchema = PaginatedResultSchema.extend({ tools: z.array(ToolSchema) });
/**
* The server's response to a tool call.
*/
const CallToolResultSchema = ResultSchema.extend({
	content: z.array(z.union([
		TextContentSchema,
		ImageContentSchema,
		AudioContentSchema,
		EmbeddedResourceSchema
	])).default([]),
	structuredContent: z.object({}).passthrough().optional(),
	isError: z.optional(z.boolean())
});
/**
* CallToolResultSchema extended with backwards compatibility to protocol version 2024-10-07.
*/
const CompatibilityCallToolResultSchema = CallToolResultSchema.or(ResultSchema.extend({ toolResult: z.unknown() }));
/**
* Used by the client to invoke a tool provided by the server.
*/
const CallToolRequestSchema = RequestSchema.extend({
	method: z.literal("tools/call"),
	params: BaseRequestParamsSchema.extend({
		name: z.string(),
		arguments: z.optional(z.record(z.unknown()))
	})
});
/**
* An optional notification from the server to the client, informing it that the list of tools it offers has changed. This may be issued by servers without any previous subscription from the client.
*/
const ToolListChangedNotificationSchema = NotificationSchema.extend({ method: z.literal("notifications/tools/list_changed") });
/**
* The severity of a log message.
*/
const LoggingLevelSchema = z.enum([
	"debug",
	"info",
	"notice",
	"warning",
	"error",
	"critical",
	"alert",
	"emergency"
]);
/**
* A request from the client to the server, to enable or adjust logging.
*/
const SetLevelRequestSchema = RequestSchema.extend({
	method: z.literal("logging/setLevel"),
	params: BaseRequestParamsSchema.extend({ level: LoggingLevelSchema })
});
/**
* Notification of a log message passed from server to client. If no logging/setLevel request has been sent from the client, the server MAY decide which messages to send automatically.
*/
const LoggingMessageNotificationSchema = NotificationSchema.extend({
	method: z.literal("notifications/message"),
	params: BaseNotificationParamsSchema.extend({
		level: LoggingLevelSchema,
		logger: z.optional(z.string()),
		data: z.unknown()
	})
});
/**
* Hints to use for model selection.
*/
const ModelHintSchema = z.object({ name: z.string().optional() }).passthrough();
/**
* The server's preferences for model selection, requested of the client during sampling.
*/
const ModelPreferencesSchema = z.object({
	hints: z.optional(z.array(ModelHintSchema)),
	costPriority: z.optional(z.number().min(0).max(1)),
	speedPriority: z.optional(z.number().min(0).max(1)),
	intelligencePriority: z.optional(z.number().min(0).max(1))
}).passthrough();
/**
* Describes a message issued to or received from an LLM API.
*/
const SamplingMessageSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.union([
		TextContentSchema,
		ImageContentSchema,
		AudioContentSchema
	])
}).passthrough();
/**
* A request from the server to sample an LLM via the client. The client has full discretion over which model to select. The client should also inform the user before beginning sampling, to allow them to inspect the request (human in the loop) and decide whether to approve it.
*/
const CreateMessageRequestSchema = RequestSchema.extend({
	method: z.literal("sampling/createMessage"),
	params: BaseRequestParamsSchema.extend({
		messages: z.array(SamplingMessageSchema),
		systemPrompt: z.optional(z.string()),
		includeContext: z.optional(z.enum([
			"none",
			"thisServer",
			"allServers"
		])),
		temperature: z.optional(z.number()),
		maxTokens: z.number().int(),
		stopSequences: z.optional(z.array(z.string())),
		metadata: z.optional(z.object({}).passthrough()),
		modelPreferences: z.optional(ModelPreferencesSchema)
	})
});
/**
* The client's response to a sampling/create_message request from the server. The client should inform the user before returning the sampled message, to allow them to inspect the response (human in the loop) and decide whether to allow the server to see it.
*/
const CreateMessageResultSchema = ResultSchema.extend({
	model: z.string(),
	stopReason: z.optional(z.enum([
		"endTurn",
		"stopSequence",
		"maxTokens"
	]).or(z.string())),
	role: z.enum(["user", "assistant"]),
	content: z.discriminatedUnion("type", [
		TextContentSchema,
		ImageContentSchema,
		AudioContentSchema
	])
});
/**
* A reference to a resource or resource template definition.
*/
const ResourceReferenceSchema = z.object({
	type: z.literal("ref/resource"),
	uri: z.string()
}).passthrough();
/**
* Identifies a prompt.
*/
const PromptReferenceSchema = z.object({
	type: z.literal("ref/prompt"),
	name: z.string()
}).passthrough();
/**
* A request from the client to the server, to ask for completion options.
*/
const CompleteRequestSchema = RequestSchema.extend({
	method: z.literal("completion/complete"),
	params: BaseRequestParamsSchema.extend({
		ref: z.union([PromptReferenceSchema, ResourceReferenceSchema]),
		argument: z.object({
			name: z.string(),
			value: z.string()
		}).passthrough()
	})
});
/**
* The server's response to a completion/complete request
*/
const CompleteResultSchema = ResultSchema.extend({ completion: z.object({
	values: z.array(z.string()).max(100),
	total: z.optional(z.number().int()),
	hasMore: z.optional(z.boolean())
}).passthrough() });
/**
* Represents a root directory or file that the server can operate on.
*/
const RootSchema = z.object({
	uri: z.string().startsWith("file://"),
	name: z.optional(z.string())
}).passthrough();
/**
* Sent from the server to request a list of root URIs from the client.
*/
const ListRootsRequestSchema = RequestSchema.extend({ method: z.literal("roots/list") });
/**
* The client's response to a roots/list request from the server.
*/
const ListRootsResultSchema = ResultSchema.extend({ roots: z.array(RootSchema) });
/**
* A notification from the client to the server, informing it that the list of roots has changed.
*/
const RootsListChangedNotificationSchema = NotificationSchema.extend({ method: z.literal("notifications/roots/list_changed") });
const ClientRequestSchema = z.union([
	PingRequestSchema,
	InitializeRequestSchema,
	CompleteRequestSchema,
	SetLevelRequestSchema,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListResourcesRequestSchema,
	ListResourceTemplatesRequestSchema,
	ReadResourceRequestSchema,
	SubscribeRequestSchema,
	UnsubscribeRequestSchema,
	CallToolRequestSchema,
	ListToolsRequestSchema
]);
const ClientNotificationSchema = z.union([
	CancelledNotificationSchema,
	ProgressNotificationSchema,
	InitializedNotificationSchema,
	RootsListChangedNotificationSchema
]);
const ClientResultSchema = z.union([
	EmptyResultSchema,
	CreateMessageResultSchema,
	ListRootsResultSchema
]);
const ServerRequestSchema = z.union([
	PingRequestSchema,
	CreateMessageRequestSchema,
	ListRootsRequestSchema
]);
const ServerNotificationSchema = z.union([
	CancelledNotificationSchema,
	ProgressNotificationSchema,
	LoggingMessageNotificationSchema,
	ResourceUpdatedNotificationSchema,
	ResourceListChangedNotificationSchema,
	ToolListChangedNotificationSchema,
	PromptListChangedNotificationSchema
]);
const ServerResultSchema = z.union([
	EmptyResultSchema,
	InitializeResultSchema,
	CompleteResultSchema,
	GetPromptResultSchema,
	ListPromptsResultSchema,
	ListResourcesResultSchema,
	ListResourceTemplatesResultSchema,
	ReadResourceResultSchema,
	CallToolResultSchema,
	ListToolsResultSchema
]);
var McpError = class extends Error {
	constructor(code, message, data) {
		super(`MCP error ${code}: ${message}`);
		this.code = code;
		this.data = data;
		this.name = "McpError";
	}
};

//#endregion
//#region node_modules/.pnpm/@modelcontextprotocol+sdk@1.12.1/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js
/**
* The default request timeout, in miliseconds.
*/
const DEFAULT_REQUEST_TIMEOUT_MSEC = 6e4;
/**
* Implements MCP protocol framing on top of a pluggable transport, including
* features like request/response linking, notifications, and progress.
*/
var Protocol = class {
	constructor(_options) {
		this._options = _options;
		this._requestMessageId = 0;
		this._requestHandlers = /* @__PURE__ */ new Map();
		this._requestHandlerAbortControllers = /* @__PURE__ */ new Map();
		this._notificationHandlers = /* @__PURE__ */ new Map();
		this._responseHandlers = /* @__PURE__ */ new Map();
		this._progressHandlers = /* @__PURE__ */ new Map();
		this._timeoutInfo = /* @__PURE__ */ new Map();
		this.setNotificationHandler(CancelledNotificationSchema, (notification) => {
			const controller = this._requestHandlerAbortControllers.get(notification.params.requestId);
			controller === null || controller === void 0 || controller.abort(notification.params.reason);
		});
		this.setNotificationHandler(ProgressNotificationSchema, (notification) => {
			this._onprogress(notification);
		});
		this.setRequestHandler(PingRequestSchema, (_request) => ({}));
	}
	_setupTimeout(messageId, timeout, maxTotalTimeout, onTimeout, resetTimeoutOnProgress = false) {
		this._timeoutInfo.set(messageId, {
			timeoutId: setTimeout(onTimeout, timeout),
			startTime: Date.now(),
			timeout,
			maxTotalTimeout,
			resetTimeoutOnProgress,
			onTimeout
		});
	}
	_resetTimeout(messageId) {
		const info = this._timeoutInfo.get(messageId);
		if (!info) return false;
		const totalElapsed = Date.now() - info.startTime;
		if (info.maxTotalTimeout && totalElapsed >= info.maxTotalTimeout) {
			this._timeoutInfo.delete(messageId);
			throw new McpError(ErrorCode.RequestTimeout, "Maximum total timeout exceeded", {
				maxTotalTimeout: info.maxTotalTimeout,
				totalElapsed
			});
		}
		clearTimeout(info.timeoutId);
		info.timeoutId = setTimeout(info.onTimeout, info.timeout);
		return true;
	}
	_cleanupTimeout(messageId) {
		const info = this._timeoutInfo.get(messageId);
		if (info) {
			clearTimeout(info.timeoutId);
			this._timeoutInfo.delete(messageId);
		}
	}
	/**
	* Attaches to the given transport, starts it, and starts listening for messages.
	*
	* The Protocol object assumes ownership of the Transport, replacing any callbacks that have already been set, and expects that it is the only user of the Transport instance going forward.
	*/
	async connect(transport) {
		this._transport = transport;
		this._transport.onclose = () => {
			this._onclose();
		};
		this._transport.onerror = (error) => {
			this._onerror(error);
		};
		this._transport.onmessage = (message, extra) => {
			if (isJSONRPCResponse(message) || isJSONRPCError(message)) this._onresponse(message);
			else if (isJSONRPCRequest(message)) this._onrequest(message, extra);
			else if (isJSONRPCNotification(message)) this._onnotification(message);
			else this._onerror(new Error(`Unknown message type: ${JSON.stringify(message)}`));
		};
		await this._transport.start();
	}
	_onclose() {
		var _a;
		const responseHandlers = this._responseHandlers;
		this._responseHandlers = /* @__PURE__ */ new Map();
		this._progressHandlers.clear();
		this._transport = void 0;
		(_a = this.onclose) === null || _a === void 0 || _a.call(this);
		const error = new McpError(ErrorCode.ConnectionClosed, "Connection closed");
		for (const handler of responseHandlers.values()) handler(error);
	}
	_onerror(error) {
		var _a;
		(_a = this.onerror) === null || _a === void 0 || _a.call(this, error);
	}
	_onnotification(notification) {
		var _a;
		const handler = (_a = this._notificationHandlers.get(notification.method)) !== null && _a !== void 0 ? _a : this.fallbackNotificationHandler;
		if (handler === void 0) return;
		Promise.resolve().then(() => handler(notification)).catch((error) => this._onerror(new Error(`Uncaught error in notification handler: ${error}`)));
	}
	_onrequest(request, extra) {
		var _a, _b, _c, _d;
		const handler = (_a = this._requestHandlers.get(request.method)) !== null && _a !== void 0 ? _a : this.fallbackRequestHandler;
		if (handler === void 0) {
			(_b = this._transport) === null || _b === void 0 || _b.send({
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: ErrorCode.MethodNotFound,
					message: "Method not found"
				}
			}).catch((error) => this._onerror(new Error(`Failed to send an error response: ${error}`)));
			return;
		}
		const abortController = new AbortController();
		this._requestHandlerAbortControllers.set(request.id, abortController);
		const fullExtra = {
			signal: abortController.signal,
			sessionId: (_c = this._transport) === null || _c === void 0 ? void 0 : _c.sessionId,
			_meta: (_d = request.params) === null || _d === void 0 ? void 0 : _d._meta,
			sendNotification: (notification) => this.notification(notification, { relatedRequestId: request.id }),
			sendRequest: (r, resultSchema, options) => this.request(r, resultSchema, {
				...options,
				relatedRequestId: request.id
			}),
			authInfo: extra === null || extra === void 0 ? void 0 : extra.authInfo,
			requestId: request.id
		};
		Promise.resolve().then(() => handler(request, fullExtra)).then((result) => {
			var _a$1;
			if (abortController.signal.aborted) return;
			return (_a$1 = this._transport) === null || _a$1 === void 0 ? void 0 : _a$1.send({
				result,
				jsonrpc: "2.0",
				id: request.id
			});
		}, (error) => {
			var _a$1, _b$1;
			if (abortController.signal.aborted) return;
			return (_a$1 = this._transport) === null || _a$1 === void 0 ? void 0 : _a$1.send({
				jsonrpc: "2.0",
				id: request.id,
				error: {
					code: Number.isSafeInteger(error["code"]) ? error["code"] : ErrorCode.InternalError,
					message: (_b$1 = error.message) !== null && _b$1 !== void 0 ? _b$1 : "Internal error"
				}
			});
		}).catch((error) => this._onerror(new Error(`Failed to send response: ${error}`))).finally(() => {
			this._requestHandlerAbortControllers.delete(request.id);
		});
	}
	_onprogress(notification) {
		const { progressToken,...params } = notification.params;
		const messageId = Number(progressToken);
		const handler = this._progressHandlers.get(messageId);
		if (!handler) {
			this._onerror(new Error(`Received a progress notification for an unknown token: ${JSON.stringify(notification)}`));
			return;
		}
		const responseHandler = this._responseHandlers.get(messageId);
		const timeoutInfo = this._timeoutInfo.get(messageId);
		if (timeoutInfo && responseHandler && timeoutInfo.resetTimeoutOnProgress) try {
			this._resetTimeout(messageId);
		} catch (error) {
			responseHandler(error);
			return;
		}
		handler(params);
	}
	_onresponse(response) {
		const messageId = Number(response.id);
		const handler = this._responseHandlers.get(messageId);
		if (handler === void 0) {
			this._onerror(new Error(`Received a response for an unknown message ID: ${JSON.stringify(response)}`));
			return;
		}
		this._responseHandlers.delete(messageId);
		this._progressHandlers.delete(messageId);
		this._cleanupTimeout(messageId);
		if (isJSONRPCResponse(response)) handler(response);
		else {
			const error = new McpError(response.error.code, response.error.message, response.error.data);
			handler(error);
		}
	}
	get transport() {
		return this._transport;
	}
	/**
	* Closes the connection.
	*/
	async close() {
		var _a;
		await ((_a = this._transport) === null || _a === void 0 ? void 0 : _a.close());
	}
	/**
	* Sends a request and wait for a response.
	*
	* Do not use this method to emit notifications! Use notification() instead.
	*/
	request(request, resultSchema, options) {
		const { relatedRequestId, resumptionToken, onresumptiontoken } = options !== null && options !== void 0 ? options : {};
		return new Promise((resolve, reject) => {
			var _a, _b, _c, _d, _e, _f;
			if (!this._transport) {
				reject(new Error("Not connected"));
				return;
			}
			if (((_a = this._options) === null || _a === void 0 ? void 0 : _a.enforceStrictCapabilities) === true) this.assertCapabilityForMethod(request.method);
			(_b = options === null || options === void 0 ? void 0 : options.signal) === null || _b === void 0 || _b.throwIfAborted();
			const messageId = this._requestMessageId++;
			const jsonrpcRequest = {
				...request,
				jsonrpc: "2.0",
				id: messageId
			};
			if (options === null || options === void 0 ? void 0 : options.onprogress) {
				this._progressHandlers.set(messageId, options.onprogress);
				jsonrpcRequest.params = {
					...request.params,
					_meta: {
						...((_c = request.params) === null || _c === void 0 ? void 0 : _c._meta) || {},
						progressToken: messageId
					}
				};
			}
			const cancel = (reason) => {
				var _a$1;
				this._responseHandlers.delete(messageId);
				this._progressHandlers.delete(messageId);
				this._cleanupTimeout(messageId);
				(_a$1 = this._transport) === null || _a$1 === void 0 || _a$1.send({
					jsonrpc: "2.0",
					method: "notifications/cancelled",
					params: {
						requestId: messageId,
						reason: String(reason)
					}
				}, {
					relatedRequestId,
					resumptionToken,
					onresumptiontoken
				}).catch((error) => this._onerror(new Error(`Failed to send cancellation: ${error}`)));
				reject(reason);
			};
			this._responseHandlers.set(messageId, (response) => {
				var _a$1;
				if ((_a$1 = options === null || options === void 0 ? void 0 : options.signal) === null || _a$1 === void 0 ? void 0 : _a$1.aborted) return;
				if (response instanceof Error) return reject(response);
				try {
					const result = resultSchema.parse(response.result);
					resolve(result);
				} catch (error) {
					reject(error);
				}
			});
			(_d = options === null || options === void 0 ? void 0 : options.signal) === null || _d === void 0 || _d.addEventListener("abort", () => {
				var _a$1;
				cancel((_a$1 = options === null || options === void 0 ? void 0 : options.signal) === null || _a$1 === void 0 ? void 0 : _a$1.reason);
			});
			const timeout = (_e = options === null || options === void 0 ? void 0 : options.timeout) !== null && _e !== void 0 ? _e : DEFAULT_REQUEST_TIMEOUT_MSEC;
			const timeoutHandler = () => cancel(new McpError(ErrorCode.RequestTimeout, "Request timed out", { timeout }));
			this._setupTimeout(messageId, timeout, options === null || options === void 0 ? void 0 : options.maxTotalTimeout, timeoutHandler, (_f = options === null || options === void 0 ? void 0 : options.resetTimeoutOnProgress) !== null && _f !== void 0 ? _f : false);
			this._transport.send(jsonrpcRequest, {
				relatedRequestId,
				resumptionToken,
				onresumptiontoken
			}).catch((error) => {
				this._cleanupTimeout(messageId);
				reject(error);
			});
		});
	}
	/**
	* Emits a notification, which is a one-way message that does not expect a response.
	*/
	async notification(notification, options) {
		if (!this._transport) throw new Error("Not connected");
		this.assertNotificationCapability(notification.method);
		const jsonrpcNotification = {
			...notification,
			jsonrpc: "2.0"
		};
		await this._transport.send(jsonrpcNotification, options);
	}
	/**
	* Registers a handler to invoke when this protocol object receives a request with the given method.
	*
	* Note that this will replace any previous request handler for the same method.
	*/
	setRequestHandler(requestSchema, handler) {
		const method = requestSchema.shape.method.value;
		this.assertRequestHandlerCapability(method);
		this._requestHandlers.set(method, (request, extra) => {
			return Promise.resolve(handler(requestSchema.parse(request), extra));
		});
	}
	/**
	* Removes the request handler for the given method.
	*/
	removeRequestHandler(method) {
		this._requestHandlers.delete(method);
	}
	/**
	* Asserts that a request handler has not already been set for the given method, in preparation for a new one being automatically installed.
	*/
	assertCanSetRequestHandler(method) {
		if (this._requestHandlers.has(method)) throw new Error(`A request handler for ${method} already exists, which would be overridden`);
	}
	/**
	* Registers a handler to invoke when this protocol object receives a notification with the given method.
	*
	* Note that this will replace any previous notification handler for the same method.
	*/
	setNotificationHandler(notificationSchema, handler) {
		this._notificationHandlers.set(notificationSchema.shape.method.value, (notification) => Promise.resolve(handler(notificationSchema.parse(notification))));
	}
	/**
	* Removes the notification handler for the given method.
	*/
	removeNotificationHandler(method) {
		this._notificationHandlers.delete(method);
	}
};
function mergeCapabilities(base, additional) {
	return Object.entries(additional).reduce((acc, [key, value]) => {
		if (value && typeof value === "object") acc[key] = acc[key] ? {
			...acc[key],
			...value
		} : value;
		else acc[key] = value;
		return acc;
	}, { ...base });
}

//#endregion
//#region node_modules/.pnpm/@modelcontextprotocol+sdk@1.12.1/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js
/**
* An MCP server on top of a pluggable transport.
*
* This server will automatically respond to the initialization flow as initiated from the client.
*
* To use with custom types, extend the base Request/Notification/Result types and pass them as type parameters:
*
* ```typescript
* // Custom schemas
* const CustomRequestSchema = RequestSchema.extend({...})
* const CustomNotificationSchema = NotificationSchema.extend({...})
* const CustomResultSchema = ResultSchema.extend({...})
*
* // Type aliases
* type CustomRequest = z.infer<typeof CustomRequestSchema>
* type CustomNotification = z.infer<typeof CustomNotificationSchema>
* type CustomResult = z.infer<typeof CustomResultSchema>
*
* // Create typed server
* const server = new Server<CustomRequest, CustomNotification, CustomResult>({
*   name: "CustomServer",
*   version: "1.0.0"
* })
* ```
*/
var Server = class extends Protocol {
	/**
	* Initializes this server with the given name and version information.
	*/
	constructor(_serverInfo, options) {
		var _a;
		super(options);
		this._serverInfo = _serverInfo;
		this._capabilities = (_a = options === null || options === void 0 ? void 0 : options.capabilities) !== null && _a !== void 0 ? _a : {};
		this._instructions = options === null || options === void 0 ? void 0 : options.instructions;
		this.setRequestHandler(InitializeRequestSchema, (request) => this._oninitialize(request));
		this.setNotificationHandler(InitializedNotificationSchema, () => {
			var _a$1;
			return (_a$1 = this.oninitialized) === null || _a$1 === void 0 ? void 0 : _a$1.call(this);
		});
	}
	/**
	* Registers new capabilities. This can only be called before connecting to a transport.
	*
	* The new capabilities will be merged with any existing capabilities previously given (e.g., at initialization).
	*/
	registerCapabilities(capabilities) {
		if (this.transport) throw new Error("Cannot register capabilities after connecting to transport");
		this._capabilities = mergeCapabilities(this._capabilities, capabilities);
	}
	assertCapabilityForMethod(method) {
		var _a, _b;
		switch (method) {
			case "sampling/createMessage":
				if (!((_a = this._clientCapabilities) === null || _a === void 0 ? void 0 : _a.sampling)) throw new Error(`Client does not support sampling (required for ${method})`);
				break;
			case "roots/list":
				if (!((_b = this._clientCapabilities) === null || _b === void 0 ? void 0 : _b.roots)) throw new Error(`Client does not support listing roots (required for ${method})`);
				break;
			case "ping": break;
		}
	}
	assertNotificationCapability(method) {
		switch (method) {
			case "notifications/message":
				if (!this._capabilities.logging) throw new Error(`Server does not support logging (required for ${method})`);
				break;
			case "notifications/resources/updated":
			case "notifications/resources/list_changed":
				if (!this._capabilities.resources) throw new Error(`Server does not support notifying about resources (required for ${method})`);
				break;
			case "notifications/tools/list_changed":
				if (!this._capabilities.tools) throw new Error(`Server does not support notifying of tool list changes (required for ${method})`);
				break;
			case "notifications/prompts/list_changed":
				if (!this._capabilities.prompts) throw new Error(`Server does not support notifying of prompt list changes (required for ${method})`);
				break;
			case "notifications/cancelled": break;
			case "notifications/progress": break;
		}
	}
	assertRequestHandlerCapability(method) {
		switch (method) {
			case "sampling/createMessage":
				if (!this._capabilities.sampling) throw new Error(`Server does not support sampling (required for ${method})`);
				break;
			case "logging/setLevel":
				if (!this._capabilities.logging) throw new Error(`Server does not support logging (required for ${method})`);
				break;
			case "prompts/get":
			case "prompts/list":
				if (!this._capabilities.prompts) throw new Error(`Server does not support prompts (required for ${method})`);
				break;
			case "resources/list":
			case "resources/templates/list":
			case "resources/read":
				if (!this._capabilities.resources) throw new Error(`Server does not support resources (required for ${method})`);
				break;
			case "tools/call":
			case "tools/list":
				if (!this._capabilities.tools) throw new Error(`Server does not support tools (required for ${method})`);
				break;
			case "ping":
			case "initialize": break;
		}
	}
	async _oninitialize(request) {
		const requestedVersion = request.params.protocolVersion;
		this._clientCapabilities = request.params.capabilities;
		this._clientVersion = request.params.clientInfo;
		return {
			protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion) ? requestedVersion : LATEST_PROTOCOL_VERSION,
			capabilities: this.getCapabilities(),
			serverInfo: this._serverInfo,
			...this._instructions && { instructions: this._instructions }
		};
	}
	/**
	* After initialization has completed, this will be populated with the client's reported capabilities.
	*/
	getClientCapabilities() {
		return this._clientCapabilities;
	}
	/**
	* After initialization has completed, this will be populated with information about the client's name and version.
	*/
	getClientVersion() {
		return this._clientVersion;
	}
	getCapabilities() {
		return this._capabilities;
	}
	async ping() {
		return this.request({ method: "ping" }, EmptyResultSchema);
	}
	async createMessage(params, options) {
		return this.request({
			method: "sampling/createMessage",
			params
		}, CreateMessageResultSchema, options);
	}
	async listRoots(params, options) {
		return this.request({
			method: "roots/list",
			params
		}, ListRootsResultSchema, options);
	}
	async sendLoggingMessage(params) {
		return this.notification({
			method: "notifications/message",
			params
		});
	}
	async sendResourceUpdated(params) {
		return this.notification({
			method: "notifications/resources/updated",
			params
		});
	}
	async sendResourceListChanged() {
		return this.notification({ method: "notifications/resources/list_changed" });
	}
	async sendToolListChanged() {
		return this.notification({ method: "notifications/tools/list_changed" });
	}
	async sendPromptListChanged() {
		return this.notification({ method: "notifications/prompts/list_changed" });
	}
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/Options.js
const ignoreOverride = Symbol("Let zodToJsonSchema decide on which parser to use");
const defaultOptions = {
	name: void 0,
	$refStrategy: "root",
	basePath: ["#"],
	effectStrategy: "input",
	pipeStrategy: "all",
	dateStrategy: "format:date-time",
	mapStrategy: "entries",
	removeAdditionalStrategy: "passthrough",
	allowedAdditionalProperties: true,
	rejectedAdditionalProperties: false,
	definitionPath: "definitions",
	target: "jsonSchema7",
	strictUnions: false,
	definitions: {},
	errorMessages: false,
	markdownDescription: false,
	patternStrategy: "escape",
	applyRegexFlags: false,
	emailStrategy: "format:email",
	base64Strategy: "contentEncoding:base64",
	nameStrategy: "ref",
	openAiAnyTypeName: "OpenAiAnyType"
};
const getDefaultOptions = (options) => typeof options === "string" ? {
	...defaultOptions,
	name: options
} : {
	...defaultOptions,
	...options
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/Refs.js
const getRefs = (options) => {
	const _options = getDefaultOptions(options);
	const currentPath = _options.name !== void 0 ? [
		..._options.basePath,
		_options.definitionPath,
		_options.name
	] : _options.basePath;
	return {
		..._options,
		flags: { hasReferencedOpenAiAnyType: false },
		currentPath,
		propertyPath: void 0,
		seen: new Map(Object.entries(_options.definitions).map(([name, def]) => [def._def, {
			def: def._def,
			path: [
				..._options.basePath,
				_options.definitionPath,
				name
			],
			jsonSchema: void 0
		}]))
	};
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/errorMessages.js
function addErrorMessage(res, key, errorMessage, refs) {
	if (!refs?.errorMessages) return;
	if (errorMessage) res.errorMessage = {
		...res.errorMessage,
		[key]: errorMessage
	};
}
function setResponseValueAndErrors(res, key, value, errorMessage, refs) {
	res[key] = value;
	addErrorMessage(res, key, errorMessage, refs);
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/getRelativePath.js
const getRelativePath = (pathA, pathB) => {
	let i = 0;
	for (; i < pathA.length && i < pathB.length; i++) if (pathA[i] !== pathB[i]) break;
	return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/any.js
function parseAnyDef(refs) {
	if (refs.target !== "openAi") return {};
	const anyDefinitionPath = [
		...refs.basePath,
		refs.definitionPath,
		refs.openAiAnyTypeName
	];
	refs.flags.hasReferencedOpenAiAnyType = true;
	return { $ref: refs.$refStrategy === "relative" ? getRelativePath(anyDefinitionPath, refs.currentPath) : anyDefinitionPath.join("/") };
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/array.js
function parseArrayDef(def, refs) {
	const res = { type: "array" };
	if (def.type?._def && def.type?._def?.typeName !== ZodFirstPartyTypeKind.ZodAny) res.items = parseDef(def.type._def, {
		...refs,
		currentPath: [...refs.currentPath, "items"]
	});
	if (def.minLength) setResponseValueAndErrors(res, "minItems", def.minLength.value, def.minLength.message, refs);
	if (def.maxLength) setResponseValueAndErrors(res, "maxItems", def.maxLength.value, def.maxLength.message, refs);
	if (def.exactLength) {
		setResponseValueAndErrors(res, "minItems", def.exactLength.value, def.exactLength.message, refs);
		setResponseValueAndErrors(res, "maxItems", def.exactLength.value, def.exactLength.message, refs);
	}
	return res;
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/bigint.js
function parseBigintDef(def, refs) {
	const res = {
		type: "integer",
		format: "int64"
	};
	if (!def.checks) return res;
	for (const check of def.checks) switch (check.kind) {
		case "min":
			if (refs.target === "jsonSchema7") if (check.inclusive) setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
			else setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
			else {
				if (!check.inclusive) res.exclusiveMinimum = true;
				setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
			}
			break;
		case "max":
			if (refs.target === "jsonSchema7") if (check.inclusive) setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
			else setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
			else {
				if (!check.inclusive) res.exclusiveMaximum = true;
				setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
			}
			break;
		case "multipleOf":
			setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
			break;
	}
	return res;
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/boolean.js
function parseBooleanDef() {
	return { type: "boolean" };
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/branded.js
function parseBrandedDef(_def, refs) {
	return parseDef(_def.type._def, refs);
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/catch.js
const parseCatchDef = (def, refs) => {
	return parseDef(def.innerType._def, refs);
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/date.js
function parseDateDef(def, refs, overrideDateStrategy) {
	const strategy = overrideDateStrategy ?? refs.dateStrategy;
	if (Array.isArray(strategy)) return { anyOf: strategy.map((item, i) => parseDateDef(def, refs, item)) };
	switch (strategy) {
		case "string":
		case "format:date-time": return {
			type: "string",
			format: "date-time"
		};
		case "format:date": return {
			type: "string",
			format: "date"
		};
		case "integer": return integerDateParser(def, refs);
	}
}
const integerDateParser = (def, refs) => {
	const res = {
		type: "integer",
		format: "unix-time"
	};
	if (refs.target === "openApi3") return res;
	for (const check of def.checks) switch (check.kind) {
		case "min":
			setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
			break;
		case "max":
			setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
			break;
	}
	return res;
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/default.js
function parseDefaultDef(_def, refs) {
	return {
		...parseDef(_def.innerType._def, refs),
		default: _def.defaultValue()
	};
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/effects.js
function parseEffectsDef(_def, refs) {
	return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef(refs);
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/enum.js
function parseEnumDef(def) {
	return {
		type: "string",
		enum: Array.from(def.values)
	};
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/intersection.js
const isJsonSchema7AllOfType = (type) => {
	if ("type" in type && type.type === "string") return false;
	return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
	const allOf = [parseDef(def.left._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			"0"
		]
	}), parseDef(def.right._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			"1"
		]
	})].filter((x) => !!x);
	let unevaluatedProperties = refs.target === "jsonSchema2019-09" ? { unevaluatedProperties: false } : void 0;
	const mergedAllOf = [];
	allOf.forEach((schema) => {
		if (isJsonSchema7AllOfType(schema)) {
			mergedAllOf.push(...schema.allOf);
			if (schema.unevaluatedProperties === void 0) unevaluatedProperties = void 0;
		} else {
			let nestedSchema = schema;
			if ("additionalProperties" in schema && schema.additionalProperties === false) {
				const { additionalProperties,...rest } = schema;
				nestedSchema = rest;
			} else unevaluatedProperties = void 0;
			mergedAllOf.push(nestedSchema);
		}
	});
	return mergedAllOf.length ? {
		allOf: mergedAllOf,
		...unevaluatedProperties
	} : void 0;
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/literal.js
function parseLiteralDef(def, refs) {
	const parsedType = typeof def.value;
	if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") return { type: Array.isArray(def.value) ? "array" : "object" };
	if (refs.target === "openApi3") return {
		type: parsedType === "bigint" ? "integer" : parsedType,
		enum: [def.value]
	};
	return {
		type: parsedType === "bigint" ? "integer" : parsedType,
		const: def.value
	};
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/string.js
let emojiRegex = void 0;
/**
* Generated from the regular expressions found here as of 2024-05-22:
* https://github.com/colinhacks/zod/blob/master/src/types.ts.
*
* Expressions with /i flag have been changed accordingly.
*/
const zodPatterns = {
	cuid: /^[cC][^\s-]{8,}$/,
	cuid2: /^[0-9a-z]+$/,
	ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
	email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
	emoji: () => {
		if (emojiRegex === void 0) emojiRegex = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
		return emojiRegex;
	},
	uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
	ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
	ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
	ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
	ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
	base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
	base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
	nanoid: /^[a-zA-Z0-9_-]{21}$/,
	jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
	const res = { type: "string" };
	if (def.checks) for (const check of def.checks) switch (check.kind) {
		case "min":
			setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
			break;
		case "max":
			setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
			break;
		case "email":
			switch (refs.emailStrategy) {
				case "format:email":
					addFormat(res, "email", check.message, refs);
					break;
				case "format:idn-email":
					addFormat(res, "idn-email", check.message, refs);
					break;
				case "pattern:zod":
					addPattern(res, zodPatterns.email, check.message, refs);
					break;
			}
			break;
		case "url":
			addFormat(res, "uri", check.message, refs);
			break;
		case "uuid":
			addFormat(res, "uuid", check.message, refs);
			break;
		case "regex":
			addPattern(res, check.regex, check.message, refs);
			break;
		case "cuid":
			addPattern(res, zodPatterns.cuid, check.message, refs);
			break;
		case "cuid2":
			addPattern(res, zodPatterns.cuid2, check.message, refs);
			break;
		case "startsWith":
			addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
			break;
		case "endsWith":
			addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
			break;
		case "datetime":
			addFormat(res, "date-time", check.message, refs);
			break;
		case "date":
			addFormat(res, "date", check.message, refs);
			break;
		case "time":
			addFormat(res, "time", check.message, refs);
			break;
		case "duration":
			addFormat(res, "duration", check.message, refs);
			break;
		case "length":
			setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value, check.message, refs);
			setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value, check.message, refs);
			break;
		case "includes": {
			addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
			break;
		}
		case "ip": {
			if (check.version !== "v6") addFormat(res, "ipv4", check.message, refs);
			if (check.version !== "v4") addFormat(res, "ipv6", check.message, refs);
			break;
		}
		case "base64url":
			addPattern(res, zodPatterns.base64url, check.message, refs);
			break;
		case "jwt":
			addPattern(res, zodPatterns.jwt, check.message, refs);
			break;
		case "cidr": {
			if (check.version !== "v6") addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
			if (check.version !== "v4") addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
			break;
		}
		case "emoji":
			addPattern(res, zodPatterns.emoji(), check.message, refs);
			break;
		case "ulid": {
			addPattern(res, zodPatterns.ulid, check.message, refs);
			break;
		}
		case "base64": {
			switch (refs.base64Strategy) {
				case "format:binary": {
					addFormat(res, "binary", check.message, refs);
					break;
				}
				case "contentEncoding:base64": {
					setResponseValueAndErrors(res, "contentEncoding", "base64", check.message, refs);
					break;
				}
				case "pattern:zod": {
					addPattern(res, zodPatterns.base64, check.message, refs);
					break;
				}
			}
			break;
		}
		case "nanoid": addPattern(res, zodPatterns.nanoid, check.message, refs);
		case "toLowerCase":
		case "toUpperCase":
		case "trim": break;
		default:
 /* c8 ignore next */
		((_) => {})(check);
	}
	return res;
}
function escapeLiteralCheckValue(literal, refs) {
	return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
const ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
	let result = "";
	for (let i = 0; i < source.length; i++) {
		if (!ALPHA_NUMERIC.has(source[i])) result += "\\";
		result += source[i];
	}
	return result;
}
function addFormat(schema, value, message, refs) {
	if (schema.format || schema.anyOf?.some((x) => x.format)) {
		if (!schema.anyOf) schema.anyOf = [];
		if (schema.format) {
			schema.anyOf.push({
				format: schema.format,
				...schema.errorMessage && refs.errorMessages && { errorMessage: { format: schema.errorMessage.format } }
			});
			delete schema.format;
			if (schema.errorMessage) {
				delete schema.errorMessage.format;
				if (Object.keys(schema.errorMessage).length === 0) delete schema.errorMessage;
			}
		}
		schema.anyOf.push({
			format: value,
			...message && refs.errorMessages && { errorMessage: { format: message } }
		});
	} else setResponseValueAndErrors(schema, "format", value, message, refs);
}
function addPattern(schema, regex, message, refs) {
	if (schema.pattern || schema.allOf?.some((x) => x.pattern)) {
		if (!schema.allOf) schema.allOf = [];
		if (schema.pattern) {
			schema.allOf.push({
				pattern: schema.pattern,
				...schema.errorMessage && refs.errorMessages && { errorMessage: { pattern: schema.errorMessage.pattern } }
			});
			delete schema.pattern;
			if (schema.errorMessage) {
				delete schema.errorMessage.pattern;
				if (Object.keys(schema.errorMessage).length === 0) delete schema.errorMessage;
			}
		}
		schema.allOf.push({
			pattern: stringifyRegExpWithFlags(regex, refs),
			...message && refs.errorMessages && { errorMessage: { pattern: message } }
		});
	} else setResponseValueAndErrors(schema, "pattern", stringifyRegExpWithFlags(regex, refs), message, refs);
}
function stringifyRegExpWithFlags(regex, refs) {
	if (!refs.applyRegexFlags || !regex.flags) return regex.source;
	const flags = {
		i: regex.flags.includes("i"),
		m: regex.flags.includes("m"),
		s: regex.flags.includes("s")
	};
	const source = flags.i ? regex.source.toLowerCase() : regex.source;
	let pattern = "";
	let isEscaped = false;
	let inCharGroup = false;
	let inCharRange = false;
	for (let i = 0; i < source.length; i++) {
		if (isEscaped) {
			pattern += source[i];
			isEscaped = false;
			continue;
		}
		if (flags.i) {
			if (inCharGroup) {
				if (source[i].match(/[a-z]/)) {
					if (inCharRange) {
						pattern += source[i];
						pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
						inCharRange = false;
					} else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
						pattern += source[i];
						inCharRange = true;
					} else pattern += `${source[i]}${source[i].toUpperCase()}`;
					continue;
				}
			} else if (source[i].match(/[a-z]/)) {
				pattern += `[${source[i]}${source[i].toUpperCase()}]`;
				continue;
			}
		}
		if (flags.m) {
			if (source[i] === "^") {
				pattern += `(^|(?<=[\r\n]))`;
				continue;
			} else if (source[i] === "$") {
				pattern += `($|(?=[\r\n]))`;
				continue;
			}
		}
		if (flags.s && source[i] === ".") {
			pattern += inCharGroup ? `${source[i]}\r\n` : `[${source[i]}\r\n]`;
			continue;
		}
		pattern += source[i];
		if (source[i] === "\\") isEscaped = true;
		else if (inCharGroup && source[i] === "]") inCharGroup = false;
		else if (!inCharGroup && source[i] === "[") inCharGroup = true;
	}
	try {
		new RegExp(pattern);
	} catch {
		console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
		return regex.source;
	}
	return pattern;
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/record.js
function parseRecordDef(def, refs) {
	if (refs.target === "openAi") console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
	if (refs.target === "openApi3" && def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) return {
		type: "object",
		required: def.keyType._def.values,
		properties: def.keyType._def.values.reduce((acc, key) => ({
			...acc,
			[key]: parseDef(def.valueType._def, {
				...refs,
				currentPath: [
					...refs.currentPath,
					"properties",
					key
				]
			}) ?? parseAnyDef(refs)
		}), {}),
		additionalProperties: refs.rejectedAdditionalProperties
	};
	const schema = {
		type: "object",
		additionalProperties: parseDef(def.valueType._def, {
			...refs,
			currentPath: [...refs.currentPath, "additionalProperties"]
		}) ?? refs.allowedAdditionalProperties
	};
	if (refs.target === "openApi3") return schema;
	if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.checks?.length) {
		const { type,...keyType } = parseStringDef(def.keyType._def, refs);
		return {
			...schema,
			propertyNames: keyType
		};
	} else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) return {
		...schema,
		propertyNames: { enum: def.keyType._def.values }
	};
	else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.type._def.checks?.length) {
		const { type,...keyType } = parseBrandedDef(def.keyType._def, refs);
		return {
			...schema,
			propertyNames: keyType
		};
	}
	return schema;
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/map.js
function parseMapDef(def, refs) {
	if (refs.mapStrategy === "record") return parseRecordDef(def, refs);
	const keys = parseDef(def.keyType._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"items",
			"items",
			"0"
		]
	}) || parseAnyDef(refs);
	const values = parseDef(def.valueType._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"items",
			"items",
			"1"
		]
	}) || parseAnyDef(refs);
	return {
		type: "array",
		maxItems: 125,
		items: {
			type: "array",
			items: [keys, values],
			minItems: 2,
			maxItems: 2
		}
	};
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/nativeEnum.js
function parseNativeEnumDef(def) {
	const object = def.values;
	const actualKeys = Object.keys(def.values).filter((key) => {
		return typeof object[object[key]] !== "number";
	});
	const actualValues = actualKeys.map((key) => object[key]);
	const parsedTypes = Array.from(new Set(actualValues.map((values) => typeof values)));
	return {
		type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
		enum: actualValues
	};
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/never.js
function parseNeverDef(refs) {
	return refs.target === "openAi" ? void 0 : { not: parseAnyDef({
		...refs,
		currentPath: [...refs.currentPath, "not"]
	}) };
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/null.js
function parseNullDef(refs) {
	return refs.target === "openApi3" ? {
		enum: ["null"],
		nullable: true
	} : { type: "null" };
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/union.js
const primitiveMappings = {
	ZodString: "string",
	ZodNumber: "number",
	ZodBigInt: "integer",
	ZodBoolean: "boolean",
	ZodNull: "null"
};
function parseUnionDef(def, refs) {
	if (refs.target === "openApi3") return asAnyOf(def, refs);
	const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
	if (options.every((x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
		const types = options.reduce((types$1, x) => {
			const type = primitiveMappings[x._def.typeName];
			return type && !types$1.includes(type) ? [...types$1, type] : types$1;
		}, []);
		return { type: types.length > 1 ? types : types[0] };
	} else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
		const types = options.reduce((acc, x) => {
			const type = typeof x._def.value;
			switch (type) {
				case "string":
				case "number":
				case "boolean": return [...acc, type];
				case "bigint": return [...acc, "integer"];
				case "object": if (x._def.value === null) return [...acc, "null"];
				case "symbol":
				case "undefined":
				case "function":
				default: return acc;
			}
		}, []);
		if (types.length === options.length) {
			const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
			return {
				type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
				enum: options.reduce((acc, x) => {
					return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
				}, [])
			};
		}
	} else if (options.every((x) => x._def.typeName === "ZodEnum")) return {
		type: "string",
		enum: options.reduce((acc, x) => [...acc, ...x._def.values.filter((x$1) => !acc.includes(x$1))], [])
	};
	return asAnyOf(def, refs);
}
const asAnyOf = (def, refs) => {
	const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i) => parseDef(x._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"anyOf",
			`${i}`
		]
	})).filter((x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
	return anyOf.length ? { anyOf } : void 0;
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/nullable.js
function parseNullableDef(def, refs) {
	if ([
		"ZodString",
		"ZodNumber",
		"ZodBigInt",
		"ZodBoolean",
		"ZodNull"
	].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
		if (refs.target === "openApi3") return {
			type: primitiveMappings[def.innerType._def.typeName],
			nullable: true
		};
		return { type: [primitiveMappings[def.innerType._def.typeName], "null"] };
	}
	if (refs.target === "openApi3") {
		const base$1 = parseDef(def.innerType._def, {
			...refs,
			currentPath: [...refs.currentPath]
		});
		if (base$1 && "$ref" in base$1) return {
			allOf: [base$1],
			nullable: true
		};
		return base$1 && {
			...base$1,
			nullable: true
		};
	}
	const base = parseDef(def.innerType._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"anyOf",
			"0"
		]
	});
	return base && { anyOf: [base, { type: "null" }] };
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/number.js
function parseNumberDef(def, refs) {
	const res = { type: "number" };
	if (!def.checks) return res;
	for (const check of def.checks) switch (check.kind) {
		case "int":
			res.type = "integer";
			addErrorMessage(res, "type", check.message, refs);
			break;
		case "min":
			if (refs.target === "jsonSchema7") if (check.inclusive) setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
			else setResponseValueAndErrors(res, "exclusiveMinimum", check.value, check.message, refs);
			else {
				if (!check.inclusive) res.exclusiveMinimum = true;
				setResponseValueAndErrors(res, "minimum", check.value, check.message, refs);
			}
			break;
		case "max":
			if (refs.target === "jsonSchema7") if (check.inclusive) setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
			else setResponseValueAndErrors(res, "exclusiveMaximum", check.value, check.message, refs);
			else {
				if (!check.inclusive) res.exclusiveMaximum = true;
				setResponseValueAndErrors(res, "maximum", check.value, check.message, refs);
			}
			break;
		case "multipleOf":
			setResponseValueAndErrors(res, "multipleOf", check.value, check.message, refs);
			break;
	}
	return res;
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/object.js
function parseObjectDef(def, refs) {
	const forceOptionalIntoNullable = refs.target === "openAi";
	const result = {
		type: "object",
		properties: {}
	};
	const required = [];
	const shape = def.shape();
	for (const propName in shape) {
		let propDef = shape[propName];
		if (propDef === void 0 || propDef._def === void 0) continue;
		let propOptional = safeIsOptional(propDef);
		if (propOptional && forceOptionalIntoNullable) {
			if (propDef._def.typeName === "ZodOptional") propDef = propDef._def.innerType;
			if (!propDef.isNullable()) propDef = propDef.nullable();
			propOptional = false;
		}
		const parsedDef = parseDef(propDef._def, {
			...refs,
			currentPath: [
				...refs.currentPath,
				"properties",
				propName
			],
			propertyPath: [
				...refs.currentPath,
				"properties",
				propName
			]
		});
		if (parsedDef === void 0) continue;
		result.properties[propName] = parsedDef;
		if (!propOptional) required.push(propName);
	}
	if (required.length) result.required = required;
	const additionalProperties = decideAdditionalProperties(def, refs);
	if (additionalProperties !== void 0) result.additionalProperties = additionalProperties;
	return result;
}
function decideAdditionalProperties(def, refs) {
	if (def.catchall._def.typeName !== "ZodNever") return parseDef(def.catchall._def, {
		...refs,
		currentPath: [...refs.currentPath, "additionalProperties"]
	});
	switch (def.unknownKeys) {
		case "passthrough": return refs.allowedAdditionalProperties;
		case "strict": return refs.rejectedAdditionalProperties;
		case "strip": return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
	}
}
function safeIsOptional(schema) {
	try {
		return schema.isOptional();
	} catch {
		return true;
	}
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/optional.js
const parseOptionalDef = (def, refs) => {
	if (refs.currentPath.toString() === refs.propertyPath?.toString()) return parseDef(def.innerType._def, refs);
	const innerSchema = parseDef(def.innerType._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"anyOf",
			"1"
		]
	});
	return innerSchema ? { anyOf: [{ not: parseAnyDef(refs) }, innerSchema] } : parseAnyDef(refs);
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/pipeline.js
const parsePipelineDef = (def, refs) => {
	if (refs.pipeStrategy === "input") return parseDef(def.in._def, refs);
	else if (refs.pipeStrategy === "output") return parseDef(def.out._def, refs);
	const a = parseDef(def.in._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			"0"
		]
	});
	const b = parseDef(def.out._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			a ? "1" : "0"
		]
	});
	return { allOf: [a, b].filter((x) => x !== void 0) };
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/promise.js
function parsePromiseDef(def, refs) {
	return parseDef(def.type._def, refs);
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/set.js
function parseSetDef(def, refs) {
	const items = parseDef(def.valueType._def, {
		...refs,
		currentPath: [...refs.currentPath, "items"]
	});
	const schema = {
		type: "array",
		uniqueItems: true,
		items
	};
	if (def.minSize) setResponseValueAndErrors(schema, "minItems", def.minSize.value, def.minSize.message, refs);
	if (def.maxSize) setResponseValueAndErrors(schema, "maxItems", def.maxSize.value, def.maxSize.message, refs);
	return schema;
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/tuple.js
function parseTupleDef(def, refs) {
	if (def.rest) return {
		type: "array",
		minItems: def.items.length,
		items: def.items.map((x, i) => parseDef(x._def, {
			...refs,
			currentPath: [
				...refs.currentPath,
				"items",
				`${i}`
			]
		})).reduce((acc, x) => x === void 0 ? acc : [...acc, x], []),
		additionalItems: parseDef(def.rest._def, {
			...refs,
			currentPath: [...refs.currentPath, "additionalItems"]
		})
	};
	else return {
		type: "array",
		minItems: def.items.length,
		maxItems: def.items.length,
		items: def.items.map((x, i) => parseDef(x._def, {
			...refs,
			currentPath: [
				...refs.currentPath,
				"items",
				`${i}`
			]
		})).reduce((acc, x) => x === void 0 ? acc : [...acc, x], [])
	};
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/undefined.js
function parseUndefinedDef(refs) {
	return { not: parseAnyDef(refs) };
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/unknown.js
function parseUnknownDef(refs) {
	return parseAnyDef(refs);
}

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parsers/readonly.js
const parseReadonlyDef = (def, refs) => {
	return parseDef(def.innerType._def, refs);
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/selectParser.js
const selectParser = (def, typeName, refs) => {
	switch (typeName) {
		case ZodFirstPartyTypeKind.ZodString: return parseStringDef(def, refs);
		case ZodFirstPartyTypeKind.ZodNumber: return parseNumberDef(def, refs);
		case ZodFirstPartyTypeKind.ZodObject: return parseObjectDef(def, refs);
		case ZodFirstPartyTypeKind.ZodBigInt: return parseBigintDef(def, refs);
		case ZodFirstPartyTypeKind.ZodBoolean: return parseBooleanDef();
		case ZodFirstPartyTypeKind.ZodDate: return parseDateDef(def, refs);
		case ZodFirstPartyTypeKind.ZodUndefined: return parseUndefinedDef(refs);
		case ZodFirstPartyTypeKind.ZodNull: return parseNullDef(refs);
		case ZodFirstPartyTypeKind.ZodArray: return parseArrayDef(def, refs);
		case ZodFirstPartyTypeKind.ZodUnion:
		case ZodFirstPartyTypeKind.ZodDiscriminatedUnion: return parseUnionDef(def, refs);
		case ZodFirstPartyTypeKind.ZodIntersection: return parseIntersectionDef(def, refs);
		case ZodFirstPartyTypeKind.ZodTuple: return parseTupleDef(def, refs);
		case ZodFirstPartyTypeKind.ZodRecord: return parseRecordDef(def, refs);
		case ZodFirstPartyTypeKind.ZodLiteral: return parseLiteralDef(def, refs);
		case ZodFirstPartyTypeKind.ZodEnum: return parseEnumDef(def);
		case ZodFirstPartyTypeKind.ZodNativeEnum: return parseNativeEnumDef(def);
		case ZodFirstPartyTypeKind.ZodNullable: return parseNullableDef(def, refs);
		case ZodFirstPartyTypeKind.ZodOptional: return parseOptionalDef(def, refs);
		case ZodFirstPartyTypeKind.ZodMap: return parseMapDef(def, refs);
		case ZodFirstPartyTypeKind.ZodSet: return parseSetDef(def, refs);
		case ZodFirstPartyTypeKind.ZodLazy: return () => def.getter()._def;
		case ZodFirstPartyTypeKind.ZodPromise: return parsePromiseDef(def, refs);
		case ZodFirstPartyTypeKind.ZodNaN:
		case ZodFirstPartyTypeKind.ZodNever: return parseNeverDef(refs);
		case ZodFirstPartyTypeKind.ZodEffects: return parseEffectsDef(def, refs);
		case ZodFirstPartyTypeKind.ZodAny: return parseAnyDef(refs);
		case ZodFirstPartyTypeKind.ZodUnknown: return parseUnknownDef(refs);
		case ZodFirstPartyTypeKind.ZodDefault: return parseDefaultDef(def, refs);
		case ZodFirstPartyTypeKind.ZodBranded: return parseBrandedDef(def, refs);
		case ZodFirstPartyTypeKind.ZodReadonly: return parseReadonlyDef(def, refs);
		case ZodFirstPartyTypeKind.ZodCatch: return parseCatchDef(def, refs);
		case ZodFirstPartyTypeKind.ZodPipeline: return parsePipelineDef(def, refs);
		case ZodFirstPartyTypeKind.ZodFunction:
		case ZodFirstPartyTypeKind.ZodVoid:
		case ZodFirstPartyTypeKind.ZodSymbol: return void 0;
		default:
 /* c8 ignore next */
		return ((_) => void 0)(typeName);
	}
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/parseDef.js
function parseDef(def, refs, forceResolution = false) {
	const seenItem = refs.seen.get(def);
	if (refs.override) {
		const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
		if (overrideResult !== ignoreOverride) return overrideResult;
	}
	if (seenItem && !forceResolution) {
		const seenSchema = get$ref(seenItem, refs);
		if (seenSchema !== void 0) return seenSchema;
	}
	const newItem = {
		def,
		path: refs.currentPath,
		jsonSchema: void 0
	};
	refs.seen.set(def, newItem);
	const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
	const jsonSchema = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
	if (jsonSchema) addMeta(def, refs, jsonSchema);
	if (refs.postProcess) {
		const postProcessResult = refs.postProcess(jsonSchema, def, refs);
		newItem.jsonSchema = jsonSchema;
		return postProcessResult;
	}
	newItem.jsonSchema = jsonSchema;
	return jsonSchema;
}
const get$ref = (item, refs) => {
	switch (refs.$refStrategy) {
		case "root": return { $ref: item.path.join("/") };
		case "relative": return { $ref: getRelativePath(refs.currentPath, item.path) };
		case "none":
		case "seen": {
			if (item.path.length < refs.currentPath.length && item.path.every((value, index) => refs.currentPath[index] === value)) {
				console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
				return parseAnyDef(refs);
			}
			return refs.$refStrategy === "seen" ? parseAnyDef(refs) : void 0;
		}
	}
};
const addMeta = (def, refs, jsonSchema) => {
	if (def.description) {
		jsonSchema.description = def.description;
		if (refs.markdownDescription) jsonSchema.markdownDescription = def.description;
	}
	return jsonSchema;
};

//#endregion
//#region node_modules/.pnpm/zod-to-json-schema@3.24.6_zod@3.25.56/node_modules/zod-to-json-schema/dist/esm/zodToJsonSchema.js
const zodToJsonSchema = (schema, options) => {
	const refs = getRefs(options);
	let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name$1, schema$1]) => ({
		...acc,
		[name$1]: parseDef(schema$1._def, {
			...refs,
			currentPath: [
				...refs.basePath,
				refs.definitionPath,
				name$1
			]
		}, true) ?? parseAnyDef(refs)
	}), {}) : void 0;
	const name = typeof options === "string" ? options : options?.nameStrategy === "title" ? void 0 : options?.name;
	const main = parseDef(schema._def, name === void 0 ? refs : {
		...refs,
		currentPath: [
			...refs.basePath,
			refs.definitionPath,
			name
		]
	}, false) ?? parseAnyDef(refs);
	const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
	if (title !== void 0) main.title = title;
	if (refs.flags.hasReferencedOpenAiAnyType) {
		if (!definitions) definitions = {};
		if (!definitions[refs.openAiAnyTypeName]) definitions[refs.openAiAnyTypeName] = {
			type: [
				"string",
				"number",
				"integer",
				"boolean",
				"array",
				"null"
			],
			items: { $ref: refs.$refStrategy === "relative" ? "1" : [
				...refs.basePath,
				refs.definitionPath,
				refs.openAiAnyTypeName
			].join("/") }
		};
	}
	const combined = name === void 0 ? definitions ? {
		...main,
		[refs.definitionPath]: definitions
	} : main : {
		$ref: [
			...refs.$refStrategy === "relative" ? [] : refs.basePath,
			refs.definitionPath,
			name
		].join("/"),
		[refs.definitionPath]: {
			...definitions,
			[name]: main
		}
	};
	if (refs.target === "jsonSchema7") combined.$schema = "http://json-schema.org/draft-07/schema#";
	else if (refs.target === "jsonSchema2019-09" || refs.target === "openAi") combined.$schema = "https://json-schema.org/draft/2019-09/schema#";
	if (refs.target === "openAi" && ("anyOf" in combined || "oneOf" in combined || "allOf" in combined || "type" in combined && Array.isArray(combined.type))) console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
	return combined;
};

//#endregion
//#region node_modules/.pnpm/@modelcontextprotocol+sdk@1.12.1/node_modules/@modelcontextprotocol/sdk/dist/esm/server/completable.js
var McpZodTypeKind;
(function(McpZodTypeKind$1) {
	McpZodTypeKind$1["Completable"] = "McpCompletable";
})(McpZodTypeKind || (McpZodTypeKind = {}));
var Completable = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		const data = ctx.data;
		return this._def.type._parse({
			data,
			path: ctx.path,
			parent: ctx
		});
	}
	unwrap() {
		return this._def.type;
	}
};
Completable.create = (type, params) => {
	return new Completable({
		type,
		typeName: McpZodTypeKind.Completable,
		complete: params.complete,
		...processCreateParams(params)
	});
};
function processCreateParams(params) {
	if (!params) return {};
	const { errorMap, invalid_type_error, required_error, description } = params;
	if (errorMap && (invalid_type_error || required_error)) throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
	if (errorMap) return {
		errorMap,
		description
	};
	const customMap = (iss, ctx) => {
		var _a, _b;
		const { message } = params;
		if (iss.code === "invalid_enum_value") return { message: message !== null && message !== void 0 ? message : ctx.defaultError };
		if (typeof ctx.data === "undefined") return { message: (_a = message !== null && message !== void 0 ? message : required_error) !== null && _a !== void 0 ? _a : ctx.defaultError };
		if (iss.code !== "invalid_type") return { message: ctx.defaultError };
		return { message: (_b = message !== null && message !== void 0 ? message : invalid_type_error) !== null && _b !== void 0 ? _b : ctx.defaultError };
	};
	return {
		errorMap: customMap,
		description
	};
}

//#endregion
//#region node_modules/.pnpm/@modelcontextprotocol+sdk@1.12.1/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js
/**
* High-level MCP server that provides a simpler API for working with resources, tools, and prompts.
* For advanced usage (like sending notifications or setting custom request handlers), use the underlying
* Server instance available via the `server` property.
*/
var McpServer = class {
	constructor(serverInfo, options) {
		this._registeredResources = {};
		this._registeredResourceTemplates = {};
		this._registeredTools = {};
		this._registeredPrompts = {};
		this._toolHandlersInitialized = false;
		this._completionHandlerInitialized = false;
		this._resourceHandlersInitialized = false;
		this._promptHandlersInitialized = false;
		this.server = new Server(serverInfo, options);
	}
	/**
	* Attaches to the given transport, starts it, and starts listening for messages.
	*
	* The `server` object assumes ownership of the Transport, replacing any callbacks that have already been set, and expects that it is the only user of the Transport instance going forward.
	*/
	async connect(transport) {
		return await this.server.connect(transport);
	}
	/**
	* Closes the connection.
	*/
	async close() {
		await this.server.close();
	}
	setToolRequestHandlers() {
		if (this._toolHandlersInitialized) return;
		this.server.assertCanSetRequestHandler(ListToolsRequestSchema.shape.method.value);
		this.server.assertCanSetRequestHandler(CallToolRequestSchema.shape.method.value);
		this.server.registerCapabilities({ tools: { listChanged: true } });
		this.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: Object.entries(this._registeredTools).filter(([, tool]) => tool.enabled).map(([name, tool]) => {
			const toolDefinition = {
				name,
				description: tool.description,
				inputSchema: tool.inputSchema ? zodToJsonSchema(tool.inputSchema, { strictUnions: true }) : EMPTY_OBJECT_JSON_SCHEMA,
				annotations: tool.annotations
			};
			if (tool.outputSchema) toolDefinition.outputSchema = zodToJsonSchema(tool.outputSchema, { strictUnions: true });
			return toolDefinition;
		}) }));
		this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
			const tool = this._registeredTools[request.params.name];
			if (!tool) throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
			if (!tool.enabled) throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} disabled`);
			let result;
			if (tool.inputSchema) {
				const parseResult = await tool.inputSchema.safeParseAsync(request.params.arguments);
				if (!parseResult.success) throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${request.params.name}: ${parseResult.error.message}`);
				const args = parseResult.data;
				const cb = tool.callback;
				try {
					result = await Promise.resolve(cb(args, extra));
				} catch (error) {
					result = {
						content: [{
							type: "text",
							text: error instanceof Error ? error.message : String(error)
						}],
						isError: true
					};
				}
			} else {
				const cb = tool.callback;
				try {
					result = await Promise.resolve(cb(extra));
				} catch (error) {
					result = {
						content: [{
							type: "text",
							text: error instanceof Error ? error.message : String(error)
						}],
						isError: true
					};
				}
			}
			if (tool.outputSchema) {
				if (!result.structuredContent) throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} has an output schema but no structured content was provided`);
				const parseResult = await tool.outputSchema.safeParseAsync(result.structuredContent);
				if (!parseResult.success) throw new McpError(ErrorCode.InvalidParams, `Invalid structured content for tool ${request.params.name}: ${parseResult.error.message}`);
			}
			return result;
		});
		this._toolHandlersInitialized = true;
	}
	setCompletionRequestHandler() {
		if (this._completionHandlerInitialized) return;
		this.server.assertCanSetRequestHandler(CompleteRequestSchema.shape.method.value);
		this.server.setRequestHandler(CompleteRequestSchema, async (request) => {
			switch (request.params.ref.type) {
				case "ref/prompt": return this.handlePromptCompletion(request, request.params.ref);
				case "ref/resource": return this.handleResourceCompletion(request, request.params.ref);
				default: throw new McpError(ErrorCode.InvalidParams, `Invalid completion reference: ${request.params.ref}`);
			}
		});
		this._completionHandlerInitialized = true;
	}
	async handlePromptCompletion(request, ref) {
		const prompt = this._registeredPrompts[ref.name];
		if (!prompt) throw new McpError(ErrorCode.InvalidParams, `Prompt ${ref.name} not found`);
		if (!prompt.enabled) throw new McpError(ErrorCode.InvalidParams, `Prompt ${ref.name} disabled`);
		if (!prompt.argsSchema) return EMPTY_COMPLETION_RESULT;
		const field = prompt.argsSchema.shape[request.params.argument.name];
		if (!(field instanceof Completable)) return EMPTY_COMPLETION_RESULT;
		const def = field._def;
		const suggestions = await def.complete(request.params.argument.value);
		return createCompletionResult(suggestions);
	}
	async handleResourceCompletion(request, ref) {
		const template = Object.values(this._registeredResourceTemplates).find((t) => t.resourceTemplate.uriTemplate.toString() === ref.uri);
		if (!template) {
			if (this._registeredResources[ref.uri]) return EMPTY_COMPLETION_RESULT;
			throw new McpError(ErrorCode.InvalidParams, `Resource template ${request.params.ref.uri} not found`);
		}
		const completer = template.resourceTemplate.completeCallback(request.params.argument.name);
		if (!completer) return EMPTY_COMPLETION_RESULT;
		const suggestions = await completer(request.params.argument.value);
		return createCompletionResult(suggestions);
	}
	setResourceRequestHandlers() {
		if (this._resourceHandlersInitialized) return;
		this.server.assertCanSetRequestHandler(ListResourcesRequestSchema.shape.method.value);
		this.server.assertCanSetRequestHandler(ListResourceTemplatesRequestSchema.shape.method.value);
		this.server.assertCanSetRequestHandler(ReadResourceRequestSchema.shape.method.value);
		this.server.registerCapabilities({ resources: { listChanged: true } });
		this.server.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
			const resources = Object.entries(this._registeredResources).filter(([_, resource]) => resource.enabled).map(([uri, resource]) => ({
				uri,
				name: resource.name,
				...resource.metadata
			}));
			const templateResources = [];
			for (const template of Object.values(this._registeredResourceTemplates)) {
				if (!template.resourceTemplate.listCallback) continue;
				const result = await template.resourceTemplate.listCallback(extra);
				for (const resource of result.resources) templateResources.push({
					...resource,
					...template.metadata
				});
			}
			return { resources: [...resources, ...templateResources] };
		});
		this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
			const resourceTemplates = Object.entries(this._registeredResourceTemplates).map(([name, template]) => ({
				name,
				uriTemplate: template.resourceTemplate.uriTemplate.toString(),
				...template.metadata
			}));
			return { resourceTemplates };
		});
		this.server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
			const uri = new URL(request.params.uri);
			const resource = this._registeredResources[uri.toString()];
			if (resource) {
				if (!resource.enabled) throw new McpError(ErrorCode.InvalidParams, `Resource ${uri} disabled`);
				return resource.readCallback(uri, extra);
			}
			for (const template of Object.values(this._registeredResourceTemplates)) {
				const variables = template.resourceTemplate.uriTemplate.match(uri.toString());
				if (variables) return template.readCallback(uri, variables, extra);
			}
			throw new McpError(ErrorCode.InvalidParams, `Resource ${uri} not found`);
		});
		this.setCompletionRequestHandler();
		this._resourceHandlersInitialized = true;
	}
	setPromptRequestHandlers() {
		if (this._promptHandlersInitialized) return;
		this.server.assertCanSetRequestHandler(ListPromptsRequestSchema.shape.method.value);
		this.server.assertCanSetRequestHandler(GetPromptRequestSchema.shape.method.value);
		this.server.registerCapabilities({ prompts: { listChanged: true } });
		this.server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: Object.entries(this._registeredPrompts).filter(([, prompt]) => prompt.enabled).map(([name, prompt]) => {
			return {
				name,
				description: prompt.description,
				arguments: prompt.argsSchema ? promptArgumentsFromSchema(prompt.argsSchema) : void 0
			};
		}) }));
		this.server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => {
			const prompt = this._registeredPrompts[request.params.name];
			if (!prompt) throw new McpError(ErrorCode.InvalidParams, `Prompt ${request.params.name} not found`);
			if (!prompt.enabled) throw new McpError(ErrorCode.InvalidParams, `Prompt ${request.params.name} disabled`);
			if (prompt.argsSchema) {
				const parseResult = await prompt.argsSchema.safeParseAsync(request.params.arguments);
				if (!parseResult.success) throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for prompt ${request.params.name}: ${parseResult.error.message}`);
				const args = parseResult.data;
				const cb = prompt.callback;
				return await Promise.resolve(cb(args, extra));
			} else {
				const cb = prompt.callback;
				return await Promise.resolve(cb(extra));
			}
		});
		this.setCompletionRequestHandler();
		this._promptHandlersInitialized = true;
	}
	resource(name, uriOrTemplate, ...rest) {
		let metadata;
		if (typeof rest[0] === "object") metadata = rest.shift();
		const readCallback = rest[0];
		if (typeof uriOrTemplate === "string") {
			if (this._registeredResources[uriOrTemplate]) throw new Error(`Resource ${uriOrTemplate} is already registered`);
			const registeredResource = {
				name,
				metadata,
				readCallback,
				enabled: true,
				disable: () => registeredResource.update({ enabled: false }),
				enable: () => registeredResource.update({ enabled: true }),
				remove: () => registeredResource.update({ uri: null }),
				update: (updates) => {
					if (typeof updates.uri !== "undefined" && updates.uri !== uriOrTemplate) {
						delete this._registeredResources[uriOrTemplate];
						if (updates.uri) this._registeredResources[updates.uri] = registeredResource;
					}
					if (typeof updates.name !== "undefined") registeredResource.name = updates.name;
					if (typeof updates.metadata !== "undefined") registeredResource.metadata = updates.metadata;
					if (typeof updates.callback !== "undefined") registeredResource.readCallback = updates.callback;
					if (typeof updates.enabled !== "undefined") registeredResource.enabled = updates.enabled;
					this.sendResourceListChanged();
				}
			};
			this._registeredResources[uriOrTemplate] = registeredResource;
			this.setResourceRequestHandlers();
			this.sendResourceListChanged();
			return registeredResource;
		} else {
			if (this._registeredResourceTemplates[name]) throw new Error(`Resource template ${name} is already registered`);
			const registeredResourceTemplate = {
				resourceTemplate: uriOrTemplate,
				metadata,
				readCallback,
				enabled: true,
				disable: () => registeredResourceTemplate.update({ enabled: false }),
				enable: () => registeredResourceTemplate.update({ enabled: true }),
				remove: () => registeredResourceTemplate.update({ name: null }),
				update: (updates) => {
					if (typeof updates.name !== "undefined" && updates.name !== name) {
						delete this._registeredResourceTemplates[name];
						if (updates.name) this._registeredResourceTemplates[updates.name] = registeredResourceTemplate;
					}
					if (typeof updates.template !== "undefined") registeredResourceTemplate.resourceTemplate = updates.template;
					if (typeof updates.metadata !== "undefined") registeredResourceTemplate.metadata = updates.metadata;
					if (typeof updates.callback !== "undefined") registeredResourceTemplate.readCallback = updates.callback;
					if (typeof updates.enabled !== "undefined") registeredResourceTemplate.enabled = updates.enabled;
					this.sendResourceListChanged();
				}
			};
			this._registeredResourceTemplates[name] = registeredResourceTemplate;
			this.setResourceRequestHandlers();
			this.sendResourceListChanged();
			return registeredResourceTemplate;
		}
	}
	_createRegisteredTool(name, description, inputSchema, outputSchema, annotations, callback) {
		const registeredTool = {
			description,
			inputSchema: inputSchema === void 0 ? void 0 : z.object(inputSchema),
			outputSchema: outputSchema === void 0 ? void 0 : z.object(outputSchema),
			annotations,
			callback,
			enabled: true,
			disable: () => registeredTool.update({ enabled: false }),
			enable: () => registeredTool.update({ enabled: true }),
			remove: () => registeredTool.update({ name: null }),
			update: (updates) => {
				if (typeof updates.name !== "undefined" && updates.name !== name) {
					delete this._registeredTools[name];
					if (updates.name) this._registeredTools[updates.name] = registeredTool;
				}
				if (typeof updates.description !== "undefined") registeredTool.description = updates.description;
				if (typeof updates.paramsSchema !== "undefined") registeredTool.inputSchema = z.object(updates.paramsSchema);
				if (typeof updates.callback !== "undefined") registeredTool.callback = updates.callback;
				if (typeof updates.annotations !== "undefined") registeredTool.annotations = updates.annotations;
				if (typeof updates.enabled !== "undefined") registeredTool.enabled = updates.enabled;
				this.sendToolListChanged();
			}
		};
		this._registeredTools[name] = registeredTool;
		this.setToolRequestHandlers();
		this.sendToolListChanged();
		return registeredTool;
	}
	/**
	* tool() implementation. Parses arguments passed to overrides defined above.
	*/
	tool(name, ...rest) {
		if (this._registeredTools[name]) throw new Error(`Tool ${name} is already registered`);
		let description;
		let inputSchema;
		let outputSchema;
		let annotations;
		if (typeof rest[0] === "string") description = rest.shift();
		if (rest.length > 1) {
			const firstArg = rest[0];
			if (isZodRawShape(firstArg)) {
				inputSchema = rest.shift();
				if (rest.length > 1 && typeof rest[0] === "object" && rest[0] !== null && !isZodRawShape(rest[0])) annotations = rest.shift();
			} else if (typeof firstArg === "object" && firstArg !== null) annotations = rest.shift();
		}
		const callback = rest[0];
		return this._createRegisteredTool(name, description, inputSchema, outputSchema, annotations, callback);
	}
	/**
	* Registers a tool with a config object and callback.
	*/
	registerTool(name, config, cb) {
		if (this._registeredTools[name]) throw new Error(`Tool ${name} is already registered`);
		const { description, inputSchema, outputSchema, annotations } = config;
		return this._createRegisteredTool(name, description, inputSchema, outputSchema, annotations, cb);
	}
	prompt(name, ...rest) {
		if (this._registeredPrompts[name]) throw new Error(`Prompt ${name} is already registered`);
		let description;
		if (typeof rest[0] === "string") description = rest.shift();
		let argsSchema;
		if (rest.length > 1) argsSchema = rest.shift();
		const cb = rest[0];
		const registeredPrompt = {
			description,
			argsSchema: argsSchema === void 0 ? void 0 : z.object(argsSchema),
			callback: cb,
			enabled: true,
			disable: () => registeredPrompt.update({ enabled: false }),
			enable: () => registeredPrompt.update({ enabled: true }),
			remove: () => registeredPrompt.update({ name: null }),
			update: (updates) => {
				if (typeof updates.name !== "undefined" && updates.name !== name) {
					delete this._registeredPrompts[name];
					if (updates.name) this._registeredPrompts[updates.name] = registeredPrompt;
				}
				if (typeof updates.description !== "undefined") registeredPrompt.description = updates.description;
				if (typeof updates.argsSchema !== "undefined") registeredPrompt.argsSchema = z.object(updates.argsSchema);
				if (typeof updates.callback !== "undefined") registeredPrompt.callback = updates.callback;
				if (typeof updates.enabled !== "undefined") registeredPrompt.enabled = updates.enabled;
				this.sendPromptListChanged();
			}
		};
		this._registeredPrompts[name] = registeredPrompt;
		this.setPromptRequestHandlers();
		this.sendPromptListChanged();
		return registeredPrompt;
	}
	/**
	* Checks if the server is connected to a transport.
	* @returns True if the server is connected
	*/
	isConnected() {
		return this.server.transport !== void 0;
	}
	/**
	* Sends a resource list changed event to the client, if connected.
	*/
	sendResourceListChanged() {
		if (this.isConnected()) this.server.sendResourceListChanged();
	}
	/**
	* Sends a tool list changed event to the client, if connected.
	*/
	sendToolListChanged() {
		if (this.isConnected()) this.server.sendToolListChanged();
	}
	/**
	* Sends a prompt list changed event to the client, if connected.
	*/
	sendPromptListChanged() {
		if (this.isConnected()) this.server.sendPromptListChanged();
	}
};
const EMPTY_OBJECT_JSON_SCHEMA = { type: "object" };
function isZodRawShape(obj) {
	if (typeof obj !== "object" || obj === null) return false;
	const isEmptyObject = Object.keys(obj).length === 0;
	return isEmptyObject || Object.values(obj).some(isZodTypeLike);
}
function isZodTypeLike(value) {
	return value !== null && typeof value === "object" && "parse" in value && typeof value.parse === "function" && "safeParse" in value && typeof value.safeParse === "function";
}
function promptArgumentsFromSchema(schema) {
	return Object.entries(schema.shape).map(([name, field]) => ({
		name,
		description: field.description,
		required: !field.isOptional()
	}));
}
function createCompletionResult(suggestions) {
	return { completion: {
		values: suggestions.slice(0, 100),
		total: suggestions.length,
		hasMore: suggestions.length > 100
	} };
}
const EMPTY_COMPLETION_RESULT = { completion: {
	values: [],
	hasMore: false
} };

//#endregion
//#region node_modules/.pnpm/@modelcontextprotocol+sdk@1.12.1/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/stdio.js
/**
* Buffers a continuous stdio stream into discrete JSON-RPC messages.
*/
var ReadBuffer = class {
	append(chunk) {
		this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
	}
	readMessage() {
		if (!this._buffer) return null;
		const index = this._buffer.indexOf("\n");
		if (index === -1) return null;
		const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
		this._buffer = this._buffer.subarray(index + 1);
		return deserializeMessage(line);
	}
	clear() {
		this._buffer = void 0;
	}
};
function deserializeMessage(line) {
	return JSONRPCMessageSchema.parse(JSON.parse(line));
}
function serializeMessage(message) {
	return JSON.stringify(message) + "\n";
}

//#endregion
//#region node_modules/.pnpm/@modelcontextprotocol+sdk@1.12.1/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js
/**
* Server transport for stdio: this communicates with a MCP client by reading from the current process' stdin and writing to stdout.
*
* This transport is only available in Node.js environments.
*/
var StdioServerTransport = class {
	constructor(_stdin = process$1.stdin, _stdout = process$1.stdout) {
		this._stdin = _stdin;
		this._stdout = _stdout;
		this._readBuffer = new ReadBuffer();
		this._started = false;
		this._ondata = (chunk) => {
			this._readBuffer.append(chunk);
			this.processReadBuffer();
		};
		this._onerror = (error) => {
			var _a;
			(_a = this.onerror) === null || _a === void 0 || _a.call(this, error);
		};
	}
	/**
	* Starts listening for messages on stdin.
	*/
	async start() {
		if (this._started) throw new Error("StdioServerTransport already started! If using Server class, note that connect() calls start() automatically.");
		this._started = true;
		this._stdin.on("data", this._ondata);
		this._stdin.on("error", this._onerror);
	}
	processReadBuffer() {
		var _a, _b;
		while (true) try {
			const message = this._readBuffer.readMessage();
			if (message === null) break;
			(_a = this.onmessage) === null || _a === void 0 || _a.call(this, message);
		} catch (error) {
			(_b = this.onerror) === null || _b === void 0 || _b.call(this, error);
		}
	}
	async close() {
		var _a;
		this._stdin.off("data", this._ondata);
		this._stdin.off("error", this._onerror);
		const remainingDataListeners = this._stdin.listenerCount("data");
		if (remainingDataListeners === 0) this._stdin.pause();
		this._readBuffer.clear();
		(_a = this.onclose) === null || _a === void 0 || _a.call(this);
	}
	send(message) {
		return new Promise((resolve) => {
			const json = serializeMessage(message);
			if (this._stdout.write(json)) resolve();
			else this._stdout.once("drain", resolve);
		});
	}
};

//#endregion
//#region src/utils/compatibleTransport.ts
/**
* Creates a transform stream that converts numeric protocolVersion to string
*/
function createProtocolVersionTransform() {
	let buffer = "";
	return new Transform({
		transform(chunk, _encoding, callback) {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) if (line.trim()) try {
				const message = JSON.parse(line);
				if (message.method === "initialize" && message.params && typeof message.params.protocolVersion === "number") {
					debugLogWithPrefix("MCP", `Converting numeric protocolVersion ${message.params.protocolVersion} to string "2024-11-05"`);
					message.params.protocolVersion = "2024-11-05";
					this.push(JSON.stringify(message) + "\n");
				} else this.push(line + "\n");
			} catch (error) {
				this.push(line + "\n");
			}
			else this.push("\n");
			callback();
		},
		flush(callback) {
			if (buffer.trim()) this.push(buffer);
			callback();
		}
	});
}
/**
* Create a compatible StdioServerTransport with protocol version handling
*/
function createCompatibleTransport() {
	const transform = createProtocolVersionTransform();
	const transformedStdin = process.stdin.pipe(transform);
	return new StdioServerTransport(transformedStdin, process.stdout);
}

//#endregion
//#region src/utils/mcpServerHelpers.ts
/**
* Convert a string-returning handler to MCP response format with error handling
*/
function toMcpToolHandler(handler, context) {
	return async (args, _extra) => {
		try {
			const message = await handler(args, context);
			return { content: [{
				type: "text",
				text: message
			}] };
		} catch (error) {
			debugLogWithPrefix("MCP", `Tool execution error in ${handler.name || "unknown"}: ${error}`);
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				content: [{
					type: "text",
					text: `Error: ${errorMessage}`
				}],
				isError: true
			};
		}
	};
}
/**
* Create an MCP server instance
*/
function createMcpServer(options) {
	const server = new McpServer({
		name: options.name,
		version: options.version
	});
	return {
		server,
		tools: /* @__PURE__ */ new Map(),
		defaultRoot: void 0,
		fileSystemApi: options.fileSystemApi
	};
}
/**
* Set default root directory for tools that accept a root parameter
*/
function setDefaultRoot(state, root) {
	state.defaultRoot = root;
}
/**
* Register a tool with the server
*/
function registerTool(state, tool) {
	state.tools.set(tool.name, tool);
	_registerToolWithServer(state, tool);
}
/**
* Register multiple tools at once
*/
function registerTools(state, tools) {
	for (const tool of tools) registerTool(state, tool);
}
/**
* Start the server with stdio transport
*/
async function startServer(state) {
	const transport = createCompatibleTransport();
	await state.server.connect(transport);
}
/**
* Get the underlying MCP server instance
*/
function getServer(state) {
	return state.server;
}
/**
* Internal method to register tool with MCP server
*/
function _registerToolWithServer(state, tool) {
	if (tool.schema instanceof ZodObject) {
		const schemaShape = tool.schema.shape;
		const wrappedHandler = state.defaultRoot && "root" in schemaShape ? (args) => {
			const argsWithRoot = {
				...args,
				root: (typeof args === "object" && args !== null && "root" in args ? args.root : void 0) || state.defaultRoot
			};
			return tool.execute(argsWithRoot, state.context);
		} : (args) => tool.execute(args, state.context);
		if (tool.description) state.server.tool(tool.name, tool.description, schemaShape, toMcpToolHandler(wrappedHandler, state.context));
		else state.server.tool(tool.name, schemaShape, toMcpToolHandler(wrappedHandler, state.context));
	} else if (tool.description) state.server.tool(tool.name, tool.description, toMcpToolHandler(tool.execute));
	else state.server.tool(tool.name, toMcpToolHandler(tool.execute));
}
/**
* Create an MCP server manager with bound methods
*/
function createMcpServerManager(options) {
	const state = createMcpServer(options);
	return {
		state,
		setDefaultRoot: (root) => setDefaultRoot(state, root),
		setContext: (context) => {
			state.context = context;
		},
		registerTool: (tool) => registerTool(state, tool),
		registerTools: (tools) => registerTools(state, tools),
		start: () => startServer(state),
		getServer: () => getServer(state)
	};
}

//#endregion
export { createMcpServerManager };