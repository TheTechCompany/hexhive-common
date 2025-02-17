import { PrismaClient } from '@hexhive/data'
import { HiveDB, HiveDBConfig, HiveDBFactory } from '@hexhive/db-types'
import { types } from '@hexhive/db-types';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export const HiveDBPG: HiveDBFactory = () => {

    const prisma = new PrismaClient();

    let db: HiveDB = {
        getApplications: async (ids?: string[]): Promise<types.Application[]> => {
            let query : any = {};
            if(ids){
                query.id = {in: ids}
            }
            console.log(query,ids)
            return await prisma.application.findMany({
                where: {
                    ...query
                },
                include: {
                    users: true
                }
            }) as any[];
        },
        createApplication: async (application: Partial<types.Application>): Promise<types.Application> => {
            return await prisma.application.create({
                data: {
                    id: nanoid(),
                    name: application.name || 'New Application',
                    backend_url: application.backend_url,
                    entrypoint: application.entrypoint,
                    slug: application.slug,
                    publicKey: application.publicKey
                }
            }) as any;
        },
        updateApplication: async (id: string, application: Partial<types.Application>): Promise<types.Application> => {
            return await prisma.application.update({
                where: {
                    id
                },
                data: {
                    name: application.name,
                    backend_url: application.backend_url,
                    entrypoint: application.entrypoint,
                    slug: application.slug,
                    publicKey: application.publicKey
                }
            }) as any;
        },
        deleteApplication: async (id: string): Promise<void> => {
            await prisma.application.delete({ where: { id } });
        },
        detachOrganisationApp: async (organisation: string, application: string) => {
            return await prisma.organisation.update({
                where: {
                    id: organisation
                },
                data: {
                    applications: {
                        disconnect: {id: application}
                    }
                }
            }) as any
        },
        attachOrganisationApp: async (organisation: string, application: string) => {
            return await prisma.organisation.update({
                where: {
                    id: organisation
                },
                data: {
                    applications: {
                        connect: {id: application}
                    }
                }
            }) as any
        },
        getOrganisations: async (ids?: string[]): Promise<types.Organisation[]> => {
            const organisations = await prisma.organisation.findMany({
                where: {
                    id: { in: ids }
                },
                include: {
                    applications: true,
                    permissions: true,
                    roles: true,
                    policies: true,
                    trustsUsers: true,
                    apiKeys: true
                }
            });
            return organisations as any;
        },
        getOrganisationApplications: async (id: string) => {

            const applications: any = await prisma.application.findMany({
                where: {
                    users: { some: { id } }
                }
            });

            return applications;
        },
        createOrganisation: async (organisation: Partial<types.Organisation>): Promise<types.Organisation> => {
            return await prisma.organisation.create({
                data: {
                    id: nanoid(),
                    name: organisation.name || 'New Organisation',
                    roles: {
                        create: {
                            id: nanoid(),
                            name: 'Admin'
                        }
                    }
                }
            }) as any;
        },
        updateOrganisation: async (id: string, organisation: Partial<types.Organisation>): Promise<types.Organisation> => {
            return await prisma.organisation.update({
                where: { id },
                data: {
                    id: nanoid(),
                    name: organisation.name || 'New Organisation',
                    roles: {
                        create: {
                            id: nanoid(),
                            name: 'Admin'
                        }
                    }
                }
            }) as any;

        },
        deleteOrganisation: async (id: string): Promise<void> => {
            await prisma.organisation.delete({
                where: { id }
            });
        },
        authenticateUser: async (username: string, password: string) => {

            const pass = crypto.createHash('sha256').update(password).digest("hex");

            const user = await prisma.user.findFirst({
                where: {
                    email: username,
                    password: pass
                },
                include: {
                    organisations: {
                        where: { inactive: false },
                        include: {
                            roles: {
                                include: {
                                    permissions: {
                                        include: {
                                            policies: true
                                        }
                                    },
                                    applications: true
                                }
                            },
                            permissions: {
                                include: {
                                    scope: true,
                                    policies: true
                                }
                            },
                            issuer: true,
                        }
                    }
                }
            });

            return user as any;

        },
        getUsers: async (ids?: string[]): Promise<types.User[]> => {
            return await prisma.user.findMany({
                where: {id: {in: ids}},
                include: {
                    organisations: {
                        where: {inactive: false},
                        include: {
                            issuer: true,
                            roles: {
                                include: {
                                    applications: true,
                                    permissions: {
                                        include: {
                                            scope: true,
                                            policies: true
                                        }
                                    }
                                }
                            },
                            permissions: {
                                include: {
                                    scope: true,
                                    policies: true
                                }
                            }
                        }
                    }
                }
            }) as any[];
        },
        getUsersByEmail: async (emails): Promise<types.User[]> => {
            return await prisma.user.findMany({
                where: {
                    email: {in: emails}
                }
            }) as any[];
        },
        getUserApplications: async (id: string, organisationId: string) => {

            // const applications = await prisma.application.findMany({
            //     where: {
            //         usedInRoles: {
            //             some: {
            //                 usedBy: {
            //                     some: {
            //                         trust: { id: id },
            //                         issuer: { id: organisationId }
            //                     }
            //                 }
            //             }
            //         },
            //         // users:
            //     }
            // });
            const applications = await prisma.application.findMany({});

            return applications as any;
        },
        getUserRoles: async (id: string, organisationId: string) => {
            const trusts = await prisma.userTrust.findMany({
                where: {
                    trustId: id,
                    issuerId: organisationId
                },
                include: {
                    roles: {
                        include: {
                            applications: true
                        }
                    }
                }
            });
            return trusts.map((x) => x.roles).reduce((prev, curr) => prev.concat(curr), []) as any[];
        },
        createUser: async (user: Partial<types.User>): Promise<types.User> => {

            const pass = crypto.createHash('sha256').update(user.password || '').digest('hex');

            const newUser = await prisma.user.create({
                data: {
                    id: nanoid(),
                    name: user.name,
                    email: user.email,
                    password: pass,
                    inactive: false
                }
            });
            return newUser as any;
        },
        updateUser: async (id: string, user: Partial<types.User>): Promise<types.User> => {
            let update : any = {};
            if(user.password) update.password = user.password;
            if(user.lastOrganisation) update.lastOrganisation = user.lastOrganisation;

            const updatedUser = await prisma.user.update({
                where: { id },
                data: {
                    name: user.name,
                    email: user.email,
                    ...update
                }
            });
            return updatedUser as any;
        },
        deleteUser: function (id: string): Promise<void> {
            throw new Error('Function not implemented.');
        },
        getOrganisationUsers: async (ids: string[], organisationId: string): Promise<types.User[]> => {

            const members: any[] = await prisma.user.findMany({
                where: {
                    id: (ids && ids.length > 0) ? { in: ids } : undefined,
                    organisations: {
                        some: {
                            issuer: {
                                id: organisationId
                            }
                        }
                    }
                },
                include: {
                    organisations: {
                        include: {
                            issuer: true
                        }
                    }
                }
            });
            return members;
        },
        createTrust: async (email: string, type: string, issuingUserId: string, organisationId: string, roles: string[], permissions: string[]): Promise<types.Trust> => {

            let existingUser: any = {};
            if (email) {
                existingUser = await prisma.user.findFirst({
                    where: {
                        email: email
                    }
                });
            }

            const currentOrg = await prisma.organisation.findFirst({ where: { id: organisationId } });
            if (!currentOrg) throw new Error("Not authorized to invite new users"); //TODO check for admin

            if (!existingUser.id){
                throw new Error("No user to trust");
            }

            let user = { id: existingUser?.id, email: existingUser?.email || email };

            const trust = await prisma.userTrust.create({
                data: {
                    id: nanoid(),
                    issuerId: organisationId,
                    trustId: user.id,
                    accepted: false,
                    type,
                    roles: {
                        connect: roles?.map((x: any) => ({ id: x })) || []
                    },
                    permissions: {
                        connect: permissions?.map((x: any) => ({ id: x })) || []
                    }
                }
            });
            return trust as any;
        },
        updateTrust: async (id: string, type: string, modifierUserId: string, organisationId: string, roles: string[], permissions: string[], inactive: boolean): Promise<types.Trust> => {
            const { id: organisationIdCheck, organisations } = await prisma.user.findFirst({
                where: {
                    id: id,
                    organisations: {
                        some: {
                            issuerId: organisationId
                        }
                    }
                },
                include: {
                    organisations: true
                }
            }) || {};

            if (!organisationIdCheck) throw new Error("No userId found");


            let update: any = {};

            if (roles) {
                update['roles'] = {
                    set: roles.map((x: string) => ({ id: x }))
                };
            }


            if (permissions) {
                update['permissions'] = {
                    set: permissions.map((x: string) => ({ id: x }))
                };
            }


            if (inactive != null) {
                update['inactive'] = inactive;
            }

            update['type'] = type;

            const trust = await prisma.userTrust.update({
                where: {
                    trustId_issuerId: {
                        trustId: id,
                        issuerId: organisationId
                    }
                },
                include: {
                    trust: true,
                    issuer: true,
                    roles: true,
                    permissions: true
                },
                data: update
            });

            return trust as any;
        },
        acceptTrust: async (id, organisation) => {
            await prisma.userTrust.update({
                where: {
                    trustId_issuerId: {
                        trustId: id,
                        issuerId: organisation
                    }
                },
                data: {
                    accepted: true
                }
            })
        },
        getPermissions: async (ids: string[], organisationId: string) => {

            return await prisma.permission.findMany({
                where: {
                    id: (ids && ids.length > 0) ? { in: ids } : undefined,
                    organisation: {
                        id: organisationId
                    }
                },
                include: {
                    policies: true,
                    scope: true
                }
            });
        },
        createPermission: async (name: string, organisationId: string) => {
            return await prisma.permission.create({
                data: {
                    id: nanoid(),
                    name: name,

                    organisation: {
                        connect: { id: organisationId }
                    }
                }
            });
        },
        updatePermission: async (id: string, name: string, scopeId: string, organisationId: string) => {
            return await prisma.permission.update({
                where: { id: id, organisation: { id: organisationId } },
                data: {
                    name: name,
                    scopeId: scopeId
                    // applications: {
                    // 	set: args.input.applications.map((x: string) => ({id: x}))
                    // }
                }
            });
        },
        deletePermission: async (id: string, organisationId: string) => {
            return await prisma.permission.delete({ where: { id: id, organisation: { id: organisationId } } });
        },
        getRoles: async (ids: string[], organisationId: string) => {
            return await prisma.role.findMany({
                where: {
                    id: (ids && ids.length > 0) ? { in: ids } : undefined,
                    organisation: { id: organisationId }
                },
                include: {
                    applications: true,
                    permissions: true
                }
            });
        },
        createRole: async (name: string, permissions: string[], applications: string[], organisationId: string) => {
            return await prisma.role.create({
                data: {
                    id: nanoid(),
                    name: name,
                    permissions: {
                        connect: permissions?.map((x: string) => ({ id: x }))
                    },
                    applications: {
                        connect: applications.map((x: string) => ({ id: x }))
                    },
                    organisation: {
                        connect: { id: organisationId }
                    }
                }
            });
        },
        updateRole: async (id: string, name: string, permissions: string[], applications: string[], organisationId: string) => {
            return await prisma.role.update({
                where: { id: id, organisationId },
                data: {
                    name: name,
                    permissions: {
                        set: permissions?.map((x: string) => ({ id: x }))
                    },
                    applications: {
                        set: applications?.map((x: string) => ({ id: x }))
                    }
                }
            });
        },
        deleteRole: async (id: string, organisationId: string) => {
            return await prisma.role.delete({ where: { id: id, organisationId } });
        },
        createPermissionPolicy: async (permissionId: string, name: string, verbs: string[], resource: string, effect: string, conditions: any, organisationId: string) => {
            const perm = await prisma.permission.findFirst({
                where: {
                    id: permissionId,
                    organisationId: organisationId
                }
            });
            if (!perm) throw new Error("Not allowed");

            return await prisma.permissionPolicy.create({
                data: {
                    id: nanoid(),
                    name: name || '',
                    verbs: verbs,
                    resource: resource,
                    effect: effect,
                    conditions: conditions,
                    usedInPermissions: {
                        connect: {
                            id: perm.id
                        }
                    },
                    organisationId: organisationId
                }
            });
        },
        updatePermissionPolicy: async (id: string, permissionId: string, name: string, verbs: string[], resource: string, effect: string, conditions: any[], organisationId: string) => {
            const perm = await prisma.permission.findFirst({
                where: {
                    id: permissionId,
                    organisationId: organisationId
                }
            });
            if (!perm) throw new Error("Not allowed");

            return await prisma.permissionPolicy.update({
                where: {
                    id: id
                },
                data: {
                    name: name,
                    verbs: verbs,
                    resource: resource,
                    effect: effect,
                    conditions: conditions,
                }
            });
        },
        deletePermissionPolicy: async (id: string, permissionId: string, organisationId: string) => {
            const perm = await prisma.permission.findFirst({
                where: {
                    id: permissionId,
                    organisationId: organisationId
                }
            });
            if (!perm) throw new Error("Not allowed");

            return await prisma.permissionPolicy.delete({
                where: { id: id }
            });
        },
        getApplicationByPublicKey: async (publicKey: string): Promise<types.Application> => {
            return await prisma.application.findFirst({ where: { publicKey } }) as any;
        },
        createApplicationChallenge: async (publicKey: string, challenge: string, application: Partial<types.Application>): Promise<types.ApplicationChallenge> => {
            return await prisma.applicationChallenge.create({
                data: {
                    id: nanoid(),
                    publicKey,
                    challenge,
                    application: application as any
                }
            }) as any;
        },
        getApplicationChallenge: async (publicKey: string, challengeId: string, challenge: string): Promise<types.ApplicationChallenge> => {
            console.log({ publicKey, challenge, challengeId });
            return await prisma.applicationChallenge.findFirst({
                where: {
                    publicKey,
                    challenge,
                    id: challengeId
                }
            }) as any;
        },
        getApplicationBySlug: async (slug: string): Promise<types.Application> => {
            return await prisma.application.findFirst({ where: { slug: slug } }) as any;
        },
        getAPIKeysByOrganisation: async (id: string) => {
            return await prisma.aPIKey.findMany({
                where: {organisationId: id}, 
                include: {
                    organisation: true, 
                    roles: true
                }
            }) as any
        },
        createAPIKey: async (name: string, roles: string[], organisationId: string): Promise<types.APIKey> => {
            return await prisma.aPIKey.create({
                data: {
                    id: nanoid(),
                    name,
                    apiKey: crypto.createHash('sha256').update(nanoid()).digest('hex'),
                    roles: {
                        connect: roles.map((x) => ({id: x}))
                    },
                    organisation: { connect: { id: organisationId } }
                },
                include: { organisation: true }
            }) as any;
        },
        updateAPIKey: async (id: string, name: string, roles: string[], organisationId: string): Promise<types.APIKey> => {
            return await prisma.aPIKey.update({
                where: {
                    id,
                    organisationId
                },
                data: {
                    name,
                    roles: {
                        set: roles.map((x) => ({id: x}))
                    },
                    lastUpdated: new Date()
                },
                include: { organisation: true }
            }) as any;
        },
        deleteAPIKey: async (id: string, organisationId: string): Promise<void> => {
            await prisma.aPIKey.delete({ where: { id, organisationId } });
        },
        getAPIKeyByKey: async (apiKey: string): Promise<types.APIKey> => {
            return await prisma.aPIKey.findFirst({
                where: {
                    apiKey
                },
                include: {
                    organisation: true,
                    roles: {
                        include: {
                            permissions: {
                                include: {
                                    policies: true
                                }
                            },
                            applications: true
                        }
                    }
                }
            }) as any;
        },
        getApplicationServiceAccountByKey: async (apiKey: string) : Promise<types.ApplicationServiceAccount> => {
            return await prisma.applicationServiceAccount.findFirst({where: {apiKey: apiKey}, include: {application: true}}) as any;
        }
    }

    return db;
}

