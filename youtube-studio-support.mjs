// Pure helpers. No API calls, media access, credentials, or persistence.
export const STUDIO_URL="https://studio.youtube.com/";
export function studioSearchCandidate(title){
 if(typeof title!=="string"||!title.trim())return "";
 const match=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?=$|[\s｜|])/.exec(title);
 if(!match)return title;
 const [,year,month,day,hour,minute]=match;
 const date=new Date(0);date.setUTCFullYear(+year,+month-1,+day);
 if(date.getUTCFullYear()!==+year||date.getUTCMonth()!==+month-1||date.getUTCDate()!==+day||+hour>23||+minute>59)return title;
 return match[0];
}
