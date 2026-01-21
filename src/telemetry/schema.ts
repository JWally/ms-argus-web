/**
 * AR-188: Zod Schemas for dev-time validation
 * This file is only imported in tests, not bundled into the browser build
 */

import { z } from 'zod'

/** Identifiers section schema */
const IdentifiersV2Schema = z.object({
	session_id: z.string(),
	evercookie_id: z.string().optional(),
	public_key: z.string().optional(),
})

/** Device hashes schema */
const DeviceHashesV2Schema = z.object({
	stable: z.string(),
	fuzzy: z.string(),
	canvas: z.string().optional(),
	webgl: z.string().optional(),
	audio: z.string().optional(),
	fonts: z.string().optional(),
})

/** Browser info schema */
const BrowserInfoV2Schema = z.object({
	user_agent: z.string().optional(),
	language: z.string().optional(),
}).optional()

/** Screen info schema */
const ScreenInfoV2Schema = z.object({
	width: z.number(),
	height: z.number(),
	color_depth: z.number().optional(),
	pixel_ratio: z.number().optional(),
}).optional()

/** Hardware info schema */
const HardwareInfoV2Schema = z.object({
	concurrency: z.number().optional(),
	memory: z.number().optional(),
	gpu: z.string().optional(),
}).optional()

/** Device section schema */
const DeviceV2Schema = z.object({
	hashes: DeviceHashesV2Schema,
	browser: BrowserInfoV2Schema,
	screen: ScreenInfoV2Schema,
	hardware: HardwareInfoV2Schema,
	timezone: z.string().optional(),
})

/** Network section schema */
const NetworkV2Schema = z.object({
	ip: z.string().optional(),
	ja4: z.string().optional(),
	ja3: z.string().optional(),
	tcp_rtt_us: z.number().optional(),
	proxy_score: z.number().optional(),
	vpn_score: z.number().optional(),
}).optional()

/** AR-188: Complete v2 payload schema for dev-time validation */
export const PayloadV2Schema = z.object({
	identifiers: IdentifiersV2Schema,
	device: DeviceV2Schema,
	network: NetworkV2Schema,
})
