const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
Promise.all([
  db.emailLog.findMany({where:{status:'QUEUED'},take:5,select:{id:true,toEmail:true,scheduledAt:true}}),
  db.emailLog.findMany({orderBy:{createdAt:'desc'},take:5,select:{id:true,toEmail:true,status:true,errorMessage:true,scheduledAt:true}}),
  db.senderAccount.findMany({select:{id:true,fromEmail:true,status:true,provider:true}}),
  db.campaign.findMany({orderBy:{createdAt:'desc'},take:3,select:{id:true,name:true,status:true,userId:true}}),
]).then(([queued,recent,senders,campaigns])=>{
  console.log('QUEUED_LOGS:',JSON.stringify(queued));
  console.log('RECENT_LOGS:',JSON.stringify(recent));
  console.log('SENDERS:',JSON.stringify(senders));
  console.log('CAMPAIGNS:',JSON.stringify(campaigns));
}).catch(e=>console.error(e)).finally(()=>db.$disconnect());
