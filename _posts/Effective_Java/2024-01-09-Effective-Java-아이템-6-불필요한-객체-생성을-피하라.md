---
title: "Effective Java - 아이템 6: 불필요한 객체 생성을 피하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### 기존 객체를 재사용해야 한다면 새로운 객체를 만들지 마라
똑같은 기능의 객체를 매번 생성하기보다 불변 객체처럼 재사용하는 편이 낫다.

```java
// 절대로 String은 new 키워드로 생성하지 말자. new 키워드로 생성시 인스턴스를 새로 만든다.
String s1 = "hi";
String s2 = new String("hi");
```

**생성자 대신 정적 팩터리 메서드를 제공하는 불변 클래스에서는 정적 팩터리 메서드를 사용해 불필요한 객체 생성을 피할 수 있다.**<br>
생성 비용이 아주 비싼 객체가 반복해서 필요하다면 캐싱하여 재사용하는 것이 좋다.

```java
static boolean isRomanNumeral(String s) {
    return s.matches("&(?=.)M*(C[MD]|D?C{0,3}" + "X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$");
}
```

위 코드는 계속 정규식을 파싱해야해서 비효율적이다.

```java
public class RomanNumerals {
    private static final Pattern ROMAN = Pattern.compile(
            "&(?=.)M*(C[MD]|D?C{0,3}" + "X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$");
    
    static boolean isRomanNumeral(String s) {
        return ROMAN.matcher(s).matches();
    }
}
```

이 코드는 정규식을 한 번 컴파일 해놓고 matches만 호출한다.

>객체가 불변이라면 재사용해도 안전함이 명백하다.

### 오토박싱(auto boxing)시 불필요한 객체 생성

```java
private static long sum() {
    Long sum = 0L; // Wrapper Long
    for (long i = 0; i <= Integer.MAX_VALUE; i++) {
        sum += i; // 기본형과 래퍼를 연산하여 매번 Long을 long으로 형변환하여 연산한다.
    }
    return sum;
}
```

> 기본형과 박싱된 기본 타입의 연산시 불필요한 형변환으로 인해 성능이 매우 떨어질 수 있다.<br>
> 박싱 타입보다는 기본 타입을 사용하고, 의도치 않은 오토박싱을 주의해야 한다.
