package br.univates.medicalfield.clinico.erros;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.core.JacksonException;
import org.springframework.http.converter.HttpMessageNotReadableException;

/** Converte qualquer erro no formato padrão {erro, mensagem, detalhes} (docs/06-api.md, seção 6.5). */
@RestControllerAdvice
public class TratadorDeErros {

    private static final Logger LOG = LoggerFactory.getLogger(TratadorDeErros.class);

    @ExceptionHandler(ErroApi.class)
    ResponseEntity<RespostaDeErro> erroApi(ErroApi erro) {
        return ResponseEntity.status(erro.status()).body(erro.corpo());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<RespostaDeErro> corpoInvalido(MethodArgumentNotValidException erro) {
        List<Detalhe> detalhes = new ArrayList<>();
        for (FieldError campo : erro.getBindingResult().getFieldErrors()) {
            detalhes.add(new Detalhe(nomeDoCampo(campo.getField()), campo.getDefaultMessage()));
        }
        erro.getBindingResult().getGlobalErrors()
                .forEach(e -> detalhes.add(new Detalhe("corpo", e.getDefaultMessage())));
        return validacao(detalhes);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<RespostaDeErro> parametroInvalido(HandlerMethodValidationException erro) {
        List<Detalhe> detalhes = erro.getParameterValidationResults().stream()
                .flatMap(r -> r.getResolvableErrors().stream()
                        .map(e -> new Detalhe(r.getMethodParameter().getParameterName(), e.getDefaultMessage())))
                .collect(Collectors.toList());
        return validacao(detalhes);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<RespostaDeErro> jsonInvalido(HttpMessageNotReadableException erro) {
        for (Throwable causa = erro; causa != null; causa = causa.getCause()) {
            if (causa instanceof JacksonException jackson && !jackson.getPath().isEmpty()) {
                String campo = jackson.getPath().stream()
                        .map(r -> r.getPropertyName() != null ? r.getPropertyName() : String.valueOf(r.getIndex()))
                        .collect(Collectors.joining("."));
                return validacao(List.of(new Detalhe(campo, "formato inválido")));
            }
        }
        return validacao(List.of(new Detalhe("corpo", "JSON inválido ou ausente")));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<RespostaDeErro> tipoInvalido(MethodArgumentTypeMismatchException erro) {
        return validacao(List.of(new Detalhe(erro.getName(), "formato inválido")));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<RespostaDeErro> parametroAusente(MissingServletRequestParameterException erro) {
        return validacao(List.of(new Detalhe(erro.getParameterName(), "campo obrigatório")));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<RespostaDeErro> tipoDeConteudo(HttpMediaTypeNotSupportedException erro) {
        return ResponseEntity.badRequest().body(new RespostaDeErro("VALIDACAO",
                "Envie o corpo em JSON (Content-Type: application/json)."));
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class,
            HttpRequestMethodNotSupportedException.class})
    ResponseEntity<RespostaDeErro> rotaInexistente(Exception erro) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new RespostaDeErro("NAO_ENCONTRADO", "Rota não encontrada."));
    }

    /** Uma regra do banco barrou os dados (algo que a validação deixou passar). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<RespostaDeErro> regraDoBanco(DataIntegrityViolationException erro) {
        LOG.warn("dados recusados pelo banco: {}", erro.getMostSpecificCause().getMessage());
        return ResponseEntity.badRequest().body(new RespostaDeErro("VALIDACAO",
                "Os dados não passaram nas regras do banco (valor fora do permitido ou ID repetido)."));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<RespostaDeErro> inesperado(Exception erro) {
        LOG.error("erro inesperado", erro);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new RespostaDeErro("ERRO_INTERNO", "Erro inesperado no servidor."));
    }

    private static ResponseEntity<RespostaDeErro> validacao(List<Detalhe> detalhes) {
        return ResponseEntity.badRequest().body(ErroApi.validacao(detalhes).corpo());
    }

    /** "medicamentos[0].dose" vira "medicamentos.0.dose", como nos outros serviços. */
    private static String nomeDoCampo(String campo) {
        return campo.replaceAll("\\[(\\d+)]", ".$1");
    }
}
