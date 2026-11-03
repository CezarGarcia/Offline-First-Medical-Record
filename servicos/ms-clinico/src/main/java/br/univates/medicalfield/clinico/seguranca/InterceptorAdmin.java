package br.univates.medicalfield.clinico.seguranca;

import br.univates.medicalfield.clinico.erros.ErroApi;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/** Confere o perfil nas rotas marcadas com {@link SomenteAdmin}. */
public class InterceptorAdmin implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest requisicao, HttpServletResponse resposta, Object handler) {
        if (handler instanceof HandlerMethod metodo && metodo.hasMethodAnnotation(SomenteAdmin.class)) {
            Object profissional = requisicao.getAttribute(FiltroAutenticacao.ATRIBUTO_PROFISSIONAL);
            if (!(profissional instanceof ProfissionalAutenticado p) || !p.administrador()) {
                throw ErroApi.proibido();
            }
        }
        return true;
    }
}
