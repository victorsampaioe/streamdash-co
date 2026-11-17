import {Link} from "@tanstack/react-router";
import {ArrowRight,Film,PlayCircle,Sparkles,Trophy} from "lucide-react";

// Static examples supplied for the November 17 launch. This is intentionally
// a poster frame of the submitted MP4, not a fake playable video.
const exampleVideoPoster="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gAQTGF2YzYxLjE5LjEwMQD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCADVAHgDASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAAMBAgQFBv/EADcQAAICAQMCAwYEBQMFAAAAAAECAAMRBBIhMUEFE1EUIjJhcZEjU4HRFUJyobEzQ8FigpLh8P/EABgBAQEBAQEAAAAAAAAAAAAAAAACAQME/8QAHhEBAQEBAQEAAwEBAAAAAAAAAAERAiExA0FREhP/2gAMAwEAAhEDEQA/APLHKtOvp9eBbThQBj3py9pZiAJev8NuTid+bjn1JXp/NbAKFSvpHaVxljgjp1nDqtYE1vkORnB7R9GoYnYznGcHHBE6ZscPjpvantRDgDKjBPeUN6M1la4BHbpmYtfaliDBcj+X5GU03lmzzSSxAwAe0yFjrFwxKKcnGMCX3hEYnpmcXR32nXMgcKCc49ZXxjxBqgdNUcMfiPoPST1cVzxerjoX+L6SnIZyW7qoziZH8Z0txAyyjP8AMJ50nMgTl/06eqfh/H8e6r1FL0eYlilAOoMyWWvq3CoTXT3bu30nnvDBdZqVrqPuscuD0x856FiLHdd2wpwABxOnHWuH5OJxfDS1ekqIVcKFJ4hXr9O1I3MBxyIjVkeRhzgOuP1nArUvctWerYzKROderXC1qFOQBxCI025qME5deDCEY8oqubMICzHsBky3v1HILK395FF76e5baviXM0nxnWb1bcuV7beOmJz16iVv3jFh94dGKgzTp7QpJJPqSVwD8pT+L6xVUBkUAcYXGRz+8XXrrC5axsj0xxK56/qOuf4fZYeWrLGruCe8l2vpqrtUhUbpg5Mj21LmCIvlk8AnpIvtLoE9M5MrZ+kyX9xevU7Nr7veDZM5l1puud26scma6gTxtyD84rWaQ6U/FnnpOfe3114snhaIh4OcxjaYmxUXncQBmZ1LBsDrNVNtu4KBz9JHivXQ06DRWXV1cuOm7vKHU2gPcSNzDacTQ9Sux8xwCO/eYLHxUa+wPBnaZI4/as2pNzgO5Ax1+czj4sg8jvIVHc+6jN9BL+y6gDJpfH0mbqskdbwzVqlRV2565MJhWkLWtoO1cdHU4P2hNc8c4vuAG0AgYyO8iQMdYDmcncd5tqFaUHK5Y+syKOcRrsRhekvnxN9TXUxfeFO1TniWezccdIFzVUKxnJ5zEblJz3HqMiZbhPWlHRWB3j5SutvGoC7sZUY4EUbQwwQAwiW+Um21UknoyVYH0mkXFjWDuxnGZkBAbnpOhplXaGGMbgZKtbBqLVGG5/q5mcvdZcRWVJ+2ZazlS+cgRCOEdHJPBnZxnhh1+oUY3NxxzIbxHUFCu7r3iL23MzDIVjkAxOSJmqyGpdYisFYhW4IhKVnLdQD84RC4V2k9JGDiT9ZClwcdCBBiWPBLGL6yyDJm6LnftGTnEFO0YwD9RLYwnPWVkdVsWyPy1+0gsv5a/wB5VmxxF7x2k6v/ADM9MJr/ACx9zLV7OoXafrEgywMa2cxrGpYOBYoZW7jiV1Vi4VEIOOuOkXg7Ofn/AIlLXVj7svm3HPvmTrxDHMqTAcxgG1BvXhuQZrC88wgq5MIYpukbsymYSVGAyQ2IrMMxo0o5ZWlsxdJ/Db6iXmNKY5lk2jtmQ645lRkGYW7Wjygybl6wrQdSOZFdrp1wPrHElzuYAH5TKvmK2fD+h/xMu7nM029P0MxZxN5+M7+rl8nJjWuDVhSOnSZswzKRhu7HQ4hF7oRopCEJgI/R6ZtXeK14HVj6CV0+ms1Dba1z6k9BOxVSmh05VTl2+JplquZrHqaqqbClXw8dTKKqnq4/SRc+ST16RZIPImz4dfVn2kYi2JyPlAnEjOTMZrWNQvklTgntkSytlRzniZ6h1GAeI3GzA7Y4k2OvNtS5G4Z6f+xF69KgAUAU/LvC1sDPymSywucmbE9WeqwhCU5iEIQCEI/R1ebeufhXkwOvpkGn0yIOuMn6zLq9RyRNFj8Tmatsn6mS6bkUDbkJPrIB5kKcVfrIlOZnWRiAhAtW7IeCP1jmYk8+kSELKSO0spO0Zk1cMWo3koCBxyfSI1OmNB67h6zRTb5TNnuIrU3BwRnOZsLjLCEJqBCEIEzpaVRXSD3bkzmToUPmpfpiK2L2sT0mfbubkAxxMWxmKJui5ew5lBNRUiTIEmA2k4Yc/WB4JHpFZ2mXPQGYrTqkVgWfn0Ez3IqnK9JYWFAeeIp7NwwILVcwzIhNSnMJEIBNdB/CH1mSaKT+H+sBxMWxgTKkzGqP1lZJ5kTWJkg4kCBIgSeRJXJXEqDjiSCQeDiGmLt2HIiHXaeOkaWwT6RTtuMCsIQhghCEAjq+EEUBk4jYFszf4XfoaEt9tVnNv4YAUHYp6tz36TnSIEjalw3e+gbnHG4ZnS8U1WluoK0lXY27q9tPl+WmPhPr29enXmcyEDqeKavSXacrTtdyyGvbTs8sBcMCe+TCnWaRfFTbhBSalX3k4B2gEgYPOc84M5cjMDraHVaKrXao2MPIc+47VgtjPYYIB+WPtI8P1Wkp0WprsZVtd8ozJnjB+R+U45Y9objA1tZQ+gopyFtFzF229FIXH16GP8Xv0GoWk6FWQ1jyyCuNyjo3HfrOZCAQhCAQhCBdcASciLhAZkSMykIDMyMygBJwOscdLqAGJpsG04PuniBQmVJzGHTXjrTYP+0w9mv2q3kvhuQdp5gKhG+zX4z5Nn/iYezX5I8mw464UwFQgRg4PWEAhCEAhCEAHJj9LpTqWdVdE2jPvHGecRAOCD6S+wHlWGPQ9YG7+EtjPtOnPXgP6StvhbVVu5vobaCSFbniZvZn7lB9XE1eGrRp9WtmtpTUUgH3BaBz2PWBTT6C2ypL6rqlOTwbApXEeRrMOLNcqsg+Ev1GM5iitPlFRSm4jAbzBwfWXoGmTw62q2hX1DOCtgsAwO4ga9BpNRrvDdRq7Ne6bM4XOckDPP8AeZbvbdLRvOpOM7MBu3Yyo8lVZVqwrHke0dYoIgv3LXX5eMbTYD+sB+3X8n2wAjH+7KWDWU1lvawckkhbOfrJdKFwVrpc+m/A/uZWkVLrEttoqakfFWLBzxAUuistRXV6zu5wWAMizRNUWV7KwyjON2Zp1B09mosevTVqjOSoFoGB6TPbUrj8NEQ55zaDArVo2tTeLKx8ieZS2nygCXVgT/KcyfZn7FD9HEpsA5Zhj0ECh4MIE5JMIBL0/wCtX/UP8ypUjtIBIII4Igev8K0lZ8G0tlOgp1Fjs/mM1W8jDcfTicvW6FW8X19Wkqp8qtzgNnjjOBj6GcpdQy52jbnk4Yj/AJlRdgEBRg9eTz/eG27JHR9gtNzU+XpsqpfPIBGcRv8AC9RuC+TpSxIGAT6kf8TlG455Xpx8R/eR5v8A0D7n94Y6A8M1GqrR1WisHsM5HOOZi1eks0dipYVJZdw2nP8A90lBaB0Qfc/vINinrWD+p/eBSEvvX8tfuf3gGU/7a/c/vApCNG38tfuYHaBny1+5/eAtfiH1lrv9az+o/wCYCxQcitc/rKEkkk9TAIQhAdiVIEIQKMMSUGTCECG+KRCEAhCEAjFAAhCBKylh5xCECsIQgEIQgf/Z";
const footballExamples=[
 {title:"Eventos de hoje",subtitle:"Jogos, horários e transmissões",src:"/examples/futebol-20261117-01-eventos.jpg",alt:"Exemplo de banner Eventos de Hoje, com jogos e emissoras, gerado em 17 de novembro de 2026"},
 {title:"Jogos do dia",subtitle:"Agenda esportiva com a sua marca",src:"/examples/futebol-20261117-02-jogos.jpg",alt:"Exemplo de arte Jogos do Dia, com sete partidas, times e transmissões"},
 {title:"Fim de jogo",subtitle:"Placar final para compartilhar",src:"/examples/futebol-20261117-03-final.jpg",alt:"Exemplo de banner Fim de Jogo com placar, bandeiras e contato da revenda"}
] as const;
export function NovemberUpdates(){
 return <section id="novidades-17-novembro" aria-labelledby="novidades-17-novembro-titulo" className="relative isolate overflow-hidden border-b border-blue-400/20 bg-gradient-to-b from-[#050d1e] via-[#091e41] to-[#061124] py-12 text-white sm:py-16">
  <div aria-hidden="true" className="pointer-events-none absolute -right-36 -top-44 h-[550px] w-[550px] rounded-full bg-blue-500/15 blur-[100px]" />
  <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
   <div className="mb-9 max-w-4xl">
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-cyan-200">
     <Sparkles size={15} /> Novidades · 17 de novembro de 2026
    </div>
    <h2 id="novidades-17-novembro-titulo" className="text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">Novas ferramentas para divulgar <span className="text-cyan-300">sua revenda.</span></h2>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-lg">Agora o Stream Monitor reúne artes de futebol para antes e depois das partidas e uma nova experiência de vídeos personalizados com logo, WhatsApp e narração original.</p>
   </div>
   <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    <article className="overflow-hidden rounded-3xl border border-cyan-300/30 bg-[#0b1c38] shadow-[0_22px_60px_rgba(2,9,24,.4)]">
     <div className="relative flex h-[300px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#0e2b55] to-[#050b19] sm:h-[360px]">
      <img src={exampleVideoPoster} alt="Quadro de demonstração de um vídeo de A Odisseia com identidade visual e contato de revenda" className="h-full w-auto max-w-full object-contain" loading="lazy" />
      <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3 py-1.5 text-[11px] font-bold text-white"><Film size={14}/> Vitrine Vídeos</span>
      <span className="absolute bottom-4 left-4 right-4 mx-auto flex max-w-[270px] items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-[#061429]/90 px-3 py-2 text-center text-xs font-bold text-cyan-100"><PlayCircle size={16}/> Prévia de vídeo personalizado</span>
     </div>
     <div className="p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2 text-cyan-200"><PlayCircle size={20}/><h3 className="text-xl font-extrabold text-white">Seu vídeo, sua identidade</h3></div>
      <p className="text-sm leading-6 text-slate-300">Personalize vídeos com logo transparente, WhatsApp e narração preservada. Exportação MP4 para divulgar a revenda.</p>
      <Link to="/vitrine-video-modelos" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-400">Conhecer Vitrine Vídeos <ArrowRight size={16}/></Link>
     </div>
    </article>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
     {footballExamples.map((item,i)=><article key={item.title} className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-blue-300/25 bg-[#0b1b37] shadow-[0_18px_40px_rgba(0,0,0,.25)]">
      <div className="relative overflow-hidden bg-[#061329] p-2.5">
       <img src={item.src} alt={item.alt} width={1080} height={1350} loading="lazy" className="mx-auto aspect-[4/5] w-full rounded-2xl object-contain transition-transform duration-300 group-hover:scale-[1.018]"/>
       <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-[#061429]/90 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white">{i===2?"PLACAR FINAL":"FUTEBOL"}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
       <h3 className="text-lg font-black text-white">{item.title}</h3>
       <p className="mt-1 flex-1 text-xs leading-5 text-slate-300">{item.subtitle}</p>
       <Link to="/vitrine-futebol" className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-300/30 bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-100 transition-colors hover:bg-blue-500/30">Criar minha arte <ArrowRight size={14}/></Link>
      </div>
     </article>)}
    </div>
   </div>
   <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-blue-400/20 bg-white/[.035] p-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:p-5">
    <p className="flex items-start gap-2 leading-6"><Trophy size={18} className="mt-0.5 shrink-0 text-yellow-300"/> <span>Crie artes dos jogos programados, atualize seus clientes após o apito final e divulgue tudo com a identidade da sua revenda. <span className="text-slate-400">Imagens demonstrativas de 17/11/2026.</span></span></p>
    <Link to="/auth" search={{tab:"signup"}} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-black text-[#06213a] transition-colors hover:bg-cyan-300">Cadastre-se <ArrowRight size={17}/></Link>
   </div>
  </div>
 </section>;
}
