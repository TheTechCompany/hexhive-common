import { PrismaClient } from "@hexhive/data";
import { nanoid } from 'nanoid'
import { disconnect } from "process";
import { sendInvite } from "../../email";
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer'
import { HiveDB } from "@hexhive/db-types";

export default (db: HiveDB, transporter?: nodemailer.Transporter) => {
	const typeDefs = `

		extend type Query {
			organisation: HiveOrganisation @merge(keyField: "id", keyArg: "ids")

			users(ids: [ID], active: Boolean): [HiveUser] @merge(keyField: "id", keyArg: "ids")

			people: [Person]

			permissions(ids: [ID]): [Permission] @merge(keyField: "id", keyArg: "ids")
			roles(ids: [ID]): [Role] @merge(keyField: "id", keyArg:"ids")
		}

		type Mutation {

			switchOrganisation(id: ID): HiveOrganisation
			
			createUserTrust(input: UserTrustInput): HiveUser
			updateUserTrust(id: ID, input: UserTrustInput): HiveUser

			createRole(input: RoleInput): Role
			updateRole(id: ID, input: RoleInput): Role
			deleteRole(id: ID): Role

			createPermission(input: PermissionInput): Permission
			updatePermission(id: ID, input: PermissionInput): Permission
			deletePermission(id: ID): Permission

			createPermissionPolicy(permission: ID, input: PermissionPolicyInput): PermissionPolicy
			updatePermissionPolicy(permission: ID, id: ID, input: PermissionPolicyInput): PermissionPolicy
			deletePermissionPolicy(permission: ID, id: ID): PermissionPolicy


			createAPIKey(input: APIKeyInput): APIKey
			updateAPIKey(id: ID, input: APIKeyInput): APIKey
			deleteAPIKey(id: ID): APIKey
		}

		type HiveOrganisation {
			id: ID! 
			name: String

			roles: [Role!]!
			members: [HiveUser!]! 

			applications: [HiveAppliance!]! 
			integrations: [HiveIntegrationInstance!]! 
			
			apiKeys: [APIKey]

			subscriptions: [HiveApplianceConfiguration!]!

		}

		input APIKeyInput {
			name: String
			roles: [String]
		}

		type APIKey{
			id: ID
			name: String
			apiKey: String

			roles: [Role]

		}

		input UserTrustInput {
			id: ID

			name: String
			type: String
			email: String
			
			inactive: Boolean

			roles: [String]
			permissions: [String]
		}

		type Person {
			id: ID

			displayId: String

			name: String
		}


		type HiveUser  {
			id: ID! 

			displayId: String

			name: String
			
			email: String
			password: String

			inactive: Boolean

			roles: [Role]
			organisation: HiveOrganisation
		}


		type HiveApplianceConfiguration {
			id: ID! 
			key: String

			permissions: [HiveTypePermission!]! 

			appliance: HiveAppliance 
			organisation: HiveOrganisation 
		}

		input RoleInput {
			name: String

			permissions: [String]
			applications: [String]
		}

		type Role {
			id: ID! 
			name: String

			applications: [HiveAppliance!]
			permissions: [Permission!] 
			organisation: HiveOrganisation 
		}

		input PermissionInput {
			name: String
			scopeId: String
		}

		type Permission {
			id: ID
			name: String

			policies: [PermissionPolicy]

			scope: HiveAppliance
		}

		input PermissionPolicyInput {
			name: String
			resource: String
			verbs: [String]
			effect: String
			conditions: JSON
		}
		type PermissionPolicy {
			id: ID
			name: String
			resource: String
			verbs: [String]
			effect: String
			conditions: JSON		
		}

		type HiveTypePermission {
			id: ID! 
			type: String

			create: Boolean
			read: Boolean
			update: Boolean
			delete: Boolean

			configuration: HiveApplianceConfiguration
		}

	
	`

	const resolvers = {
		HiveUser: {
			roles: async (root: any, args: any, context: any) => {
				return await db.getUserRoles(root.id, context?.jwt?.organisation)
			}
		},
		HiveOrganisation: {
			apiKeys: async (root: any) => {
				return await db.getAPIKeysByOrganisation(root.id);
			},
			members: async (root: any) => {
				return await db.getOrganisationUsers([], root.id)
			},
			applications: async (root: any, args: any, context: any) => {
				//Gets the applications that the organisation has installed that are also accessible by this user privilege

				//Add route for checking rbac

				//Get org applications
				//Get roles user is in for org
				//Get applications that are compatible with that role
				const applications = await db.getOrganisationApplications(context?.jwt?.organisation)

				const roles = await db.getUserRoles(context?.jwt?.id, context?.jwt?.organisation)

				console.log({applications, roles})
				return applications?.filter((application) => {
					return roles?.findIndex((role) => role?.applications?.findIndex((app) => app.id == application.id) > -1) > -1
				})

			}
		},
		Query: {
			people: async (root: any, args: any, context: any) => {
				const users = await db.getOrganisationUsers([], context?.jwt?.organisation)
				return users;
				// return await prisma.user.findMany({
				// 	where: {
				// 		organisations: {
				// 			some: {issuerId: context?.jwt?.organisation || context?.user?.organisation}, 
				// 		},
				// 		// inactive: false
				// 	},
				// 	include: {
				// 		organisations: true
				// 	}
				// })
			},
			permissions: async (root: any, args: any, context: any) => {
				return await db.getPermissions(args.ids, context?.jwt?.organisation)
			},
			roles: async (root: any, args: any, context: any) => {
				return await db.getRoles(args.ids, context?.jwt?.organisation)
			},
			organisation: async (root: any, args: any, context: any) => {

				const [org] = await db.getOrganisations([context?.jwt?.organisation])

				return org;
				// console.log({context})
				// const result = await pool.query(
				// 	`SELECT * FROM organisation WHERE id=$1`,
				// 	[context.user.organisation]
				// )
				// console.log({rows: result.rows})

				// const res = result?.rows?.[0];

				// return {
				// 	...res,
				// 	members: res.users?.map((x: any) => ({id: x}))
				// }

				// return result.rows?.[0].map((x) => ({
				// 	...x,
				// 	members: x.users.map((y: any) => ({id: y}))
				// }))
			},
			users: async (root: any, args: any, context: any) => {
				let query: any = {};

				let orgQuery: any = {};

				if (args.ids) {
					query.id = { in: args.ids }
				}

				if (args.active) {
					query.inactive = false;
					orgQuery.inactive = false;
				}

				let users = await db.getOrganisationUsers(args.ids, context?.jwt?.organisation)

				users = users.filter((user) => {
					if (query.inactive == false && user.inactive) {
						return false;
					}
					if (orgQuery.inactive == false && user.organisations?.find((a) => a.issuer.id == context?.jwt?.organisation)?.inactive) {
						return false;
					}
					return true;
				})

				// const users = await prisma.user.findMany({
				// 	where: {
				// 		organisations: {
				// 			some: {
				// 				issuerId: context?.jwt?.organisation || context?.user?.organisation,
				// 				...orgQuery
				// 			}, 
				// 		},
				// 		...query
				// 	},
				// 	include: {
				// 		organisations: true
				// 	}
				// })

				//Inactive users might still show up
				if (args.ids) {
					return args.ids.map((id: string) => users.find((a: any) => a.id == id))?.map((x: any) => ({ ...x, inactive: x.organisations?.find((a: any) => a.issuerId == context?.jwt?.organisation)?.inactive, email: x.email || '' }))
				} else {
					return users?.map((x: any) => ({ ...x, inactive: x.organisations?.find((a: any) => a.issuerId == context?.jwt?.organisation)?.inactive, email: x.email || '' }));
				}
			}

		},
		Mutation: {
			switchOrganisation: async (root: any, args: any, context: any) => {
				console.log(context?.jwt?.id, args.id)
				await db.updateUser(context?.jwt?.id, {lastOrganisation: args.id});

				const [ user ] = await db.getUsers([context?.jwt?.id]);

				const organisation = user.organisations?.find((a) => a.issuer?.id == args.id);

				if(!organisation) throw new Error('Organisation not found');

				const roles = organisation?.roles || [];

				const permissions = (organisation?.permissions || []).concat((roles || []).map((r: any) => r.permissions).reduce((p: any, c: any) => p.concat(c), []) as any[])

				const applications = roles.map((x: any) => x.applications).reduce((prev: any, curr: any) => prev.concat(curr), []).concat(permissions.map(x => x.scope))

				let userObject = {
					id: user?.id,
					name: user?.name,
					organisation: organisation?.issuer?.id,
					organisations: user?.organisations?.map((org) => org.issuer),
					applications: [...new Set(applications)],
					roles,
					permissions
				}

				context.logIn(userObject)

				// context.updateUser(userObject)
				// context.user = userObject;
				// context.jwt = userObject;
				// req.jwt

				return organisation;

			},
			createAPIKey: async (root: any, args: { input: any}, context: any) => {
				return await db.createAPIKey(args.input.name, args.input.roles || [], context?.jwt?.organisation)
			},
			updateAPIKey: async (root: any, args: { id: string, input: any}, context: any) => {
				return await db.updateAPIKey(args.id, args.input.name, args.input.roles || [], context?.jwt?.organisation)
			},
			deleteAPIKey: async (root: any, args: {id: string}, context: any) => {
				return await db.deleteAPIKey(args.id, context.jwt?.organisation)
			},
			createUserTrust: async (root: any, args: any, context: any) => {

				let userTrust: any;

				const [user] = await db.getUsersByEmail([args.input.email])

				if (!user) {
					await db.createUser({
						email: args.input.email,
						name: args.input.name
					})
				}

				try {
					userTrust = await db.createTrust(args.input?.email, args.input?.type, context?.jwt?.id, context?.jwt?.organisation, args.input?.roles, args.input?.permissions)
					// return userTrust;
				} catch (e) {
					console.log(e);
				}

				if (!transporter) {
					console.error('SMTP not setup for sending transactional emails')
				} else {

					const [organisation] = await db.getOrganisations([context?.jwt?.organisation])
					const [issuingUser] = await db.getUsers([context?.jwt?.id])
					const [newUser] = await db.getUsersByEmail([args.input.email])


					if (!user) {

						const token = jwt.sign({
							id: newUser.id,
							organisationInvite: organisation?.id,
							type: 'signup-token'
						}, process.env.JWT_SECRET || '')

						//Send invite to HexHive
						sendInvite(transporter, {
							to: args.input?.email,
							subject: "You've been invited to join HexHive",
							message: `Kia Ora${args.input.name ? ` ${args.input.name}` : ''},
		
		${issuingUser?.name} has invited you to join ${organisation.name} on HexHive

		Click the link below to setup your account and join them.
		
		https://go.hexhive.io/signup?token=${token}
	
		HexHive`,
							type: args.input?.type,
						}, {
							receiver: args.input.name,
							sender: organisation?.name,
							senderName: issuingUser?.name,
							secondaryText: `Click the link below to setup your account and join them.`,
							buttonText: 'Signup',
							link: `https://go.hexhive.io/signup?token=${token}`
						})
					} else {
						const token = jwt.sign({
							id: newUser.id,
							organisationInvite: organisation?.id,
							type: 'join-token'
						}, process.env.JWT_SECRET || '')

						sendInvite(transporter, {
							to: args.input?.email,
							subject: `You've been invite to join ${organisation.name} on HexHive`,
							message: `Kia Ora${user.name ? ` ${user.name}` : ''},
		
		${issuingUser?.name} has invited you to join ${organisation?.name} on HexHive
		
		Click the link below to join them.

		https://go.hexhive.io/join?token=${token}
	
		HexHive`,
							type: args.input?.type,
						}, {
							receiver: user.name,
							sender: organisation?.name,
							senderName: issuingUser?.name,
							secondaryText: `Click the link below to join them.`,
							buttonText: 'Join Organisation',
							link: `https://go.hexhive.io/join?token=${token}`
						})
					}

				}
				return userTrust
			},
			updateUserTrust: async (root: any, args: any, context: any) => {

				return await db.updateTrust(args.id, args.input?.type, context?.jwt?.id, context?.jwt?.organisation, args.input?.roles, args.input?.permissions, args.input?.inactive)


				// return await prisma.user.update({
				// 	where: {
				// 		id: args.id,
				// 		// organisations: {
				// 		// 	some: {
				// 		// 		issuerId: context?.jwt?.organisation || context?.user?.organisation
				// 		// 	}
				// 		// }
				// 	},
				// 	data: {
				// 		name: args.input?.name,
				// 		email: args.input?.email,
				// 		password: args.input?.password,
				// 		inactive: args.input?.inactive

				// 	}
				// })
			},
			createRole: async (root: any, args: any, context: any) => {
				return await db.createRole(args.input?.name, args.input?.permissions, args.input?.applications, context?.jwt.organisation)
			},
			updateRole: async (root: any, args: any, context: any) => {
				return await db.updateRole(args.id, args.input?.name, args.input?.permissions, args.input?.applications, context?.jwt?.organisation)
			},
			deleteRole: async (root: any, args: any, context: any) => {
				return await db.deleteRole(args.id, context?.jwt?.organisation)
			},
			createPermission: async (root: any, args: any, context: any) => {
				return await db.createPermission(args.input?.name, context?.jwt.organisation)
			},
			updatePermission: async (root: any, args: any, context: any) => {
				return await db.updatePermission(args.id, args.input?.name, args.input?.scopeId, context?.jwt?.organisation)
			},
			deletePermission: async (root: any, args: any, context: any) => {
				return await db.deletePermission(args.id, context?.jwt?.organisation)
			},
			createPermissionPolicy: async (root: any, args: any, context: any) => {
				return await db.createPermissionPolicy(args.permission, args.input?.name, args.input?.verbs, args.input?.resource, args.input?.effect, args.input?.conditions, context?.jwt?.organisation)
			},
			updatePermissionPolicy: async (root: any, args: any, context: any) => {
				return await db.updatePermissionPolicy(args.id, args.permission, args.input?.name, args.input?.verbs, args.input?.resource, args.input?.effect, args.input?.conditions, context?.jwt?.organisation)

			},
			deletePermissionPolicy: async (root: any, args: any, context: any) => {
				return await db.deletePermissionPolicy(args.id, args.permission, context?.jwt?.organisation)
			}
		}
	}

	return { typeDefs, resolvers }
}

/*
extend type Mutation {
		inviteHiveUser(name: String, email: String): String
	}

	type HiveOrganisation @auth(rules: [
		{operations: [READ], where: {id: "$jwt.organisation"}},
		{operations: [UPDATE, DELETE], bind: {id: "$jwt.organisation"}}
	]) {
		id: ID! 
		name: String

		roles: [Role!]! @relationship(type: "USES_ROLE", direction: OUT)
		members: [HiveUser!]! @relationship(type: "TRUSTS", direction: OUT)

		appliances: [HiveAppliance!]! @relationship(type: "USES_APP", direction: OUT)
		integrations: [HiveIntegrationInstance!]! @relationship(type: "USES_INTEGRATION", direction: OUT)

		subscriptions: [HiveApplianceConfiguration!]! @relationship(type: "HAS_APP_CONFIG", direction: OUT)

	}


	type HiveApplianceConfiguration @auth(rules: [
		{operations: [READ, UPDATE], where: {organisation: {id: "$jwt.organisation"}}},
		{operations: [UPDATE, DELETE], bind: {organisation: {id: "$jwt.organisation"}}}
	]) {
		id: ID! 
		key: String

		permissions: [HiveTypePermission!]! @relationship(type: "HAS_TYPE_PERMISSION", direction: OUT)

		appliance: HiveAppliance @relationship(type: "HAS_APP", direction: OUT)

		organisation: HiveOrganisation @relationship(type: "HAS_APP_CONFIG", direction: IN)
	}

	type HiveTypePermission @auth(rules: [
		{operations: [READ, UPDATE], where: {configuration: { organisation: {id: "$jwt.organisation" }}} },
		{operations: [UPDATE, DELETE], bind: {configuration: { organisation: {id: "$jwt.organisation" }}} }
	]) {
		id: ID! 
		type: String

		create: Boolean
		read: Boolean
		update: Boolean
		delete: Boolean

		configuration: HiveApplianceConfiguration @relationship(type: "HAS_TYPE_PERMISSION", direction: IN)
	}


	type HiveUser @auth(rules: [
		{operations: [READ], where: {organisation: {id: "$jwt.organisation"}}},
		{operations: [UPDATE, DELETE], bind: {organisation: {id: "$jwt.organisation"}}}
	]) {
		id: ID! 
		name: String
		username: String
		password: String
		roles: [Role!]! @relationship(type: "HAS_ROLE", direction: OUT)
		organisation: HiveOrganisation @relationship(type: "TRUSTS", direction: IN)
	}

	type Role  @auth(rules: [
		{operations: [READ], where: {organisation: {id: "$jwt.organisation"}}},
		{operations: [UPDATE, DELETE], bind: {organisation: {id: "$jwt.organisation"}}}
	]) {
		id: ID! 
		name: String

		appliances: [HiveAppliance!]! @relationship(type: "USES_APP", direction: OUT)
		permissions: [Permission!]! @relationship(type: "USES_PERMISSION", direction: OUT)
		organisation: HiveOrganisation @relationship(type: "USES_ROLE", direction: IN)
	}


	type Permission {
		id: ID! 
		name: String

		action: String
		scope: String

		roles: [Role!]! @relationship(type: "USES_PERMISSION", direction: IN)
	}
*/